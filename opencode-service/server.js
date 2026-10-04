import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const CLI_BIN = process.env.OPENCODE_CLI_BIN ?? 'opencode';
const WORK_DIR = process.env.OPENCODE_WORK_DIR ?? '/work';
const TIMEOUT_MS = Number(process.env.OPENCODE_TIMEOUT_MS ?? 180_000);

// `opencode run` nặng vì tự khởi tạo từ đầu mỗi lần (bootstrap, nạp config, tạo session) - đã đo 2026-10-04: gắn vào MỘT `opencode serve` sống sẵn qua `--attach` thì 8 request đồng thời với prompt nặng (~6KB) xong trong 9-14 giây, so với 65-90 giây khi spawn riêng từng tiến trình đầy đủ.
const SERVE_PORT = Number(process.env.OPENCODE_SERVE_PORT ?? 4097);
const SERVE_URL = `http://127.0.0.1:${SERVE_PORT}`;
const SERVE_RESTART_DELAY_MS = Number(process.env.OPENCODE_SERVE_RESTART_DELAY_MS ?? 2_000);

// Trần tiến trình `run --attach` chạy cùng lúc. Không còn giới hạn bởi CPU chia sẻ giữa N tiến trình nặng (việc nặng giờ nằm trong MỘT `serve` dùng chung) - trần này chỉ còn để chặn số tiến trình/session mở cùng lúc không phình vô tội vạ. Đã đo an toàn tới 8 đồng thời trên 1 CPU/2GB; 5 là mức giữ biên an toàn.
const MAX_CONCURRENCY = Number(process.env.OPENCODE_MAX_CONCURRENCY ?? 5);

// Trần argv. Đặt thấp hơn trần thật để chừa chỗ cho các cờ đi kèm.
const MESSAGE_LIMIT = Number(process.env.OPENCODE_MESSAGE_LIMIT ?? 100_000);

// Danh sách dự phòng, chỉ dùng khi `opencode models` không chạy được.
const FALLBACK_MODELS = (process.env.OPENCODE_MODELS ?? 'big-pickle')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const MODELS_TTL_MS = Number(process.env.OPENCODE_MODELS_TTL_MS ?? 300_000);
let modelsCache = { at: 0, ids: [] };

// Bể Zen trả danh sách KHÁC NHAU giữa hai lần hỏi liền nhau (đo 2026-09-28: `space-bunny-free` có ở lần 2 và 3, vắng ở lần 1), nên giữ mọi model đã thấy trong cửa sổ này.
const MODELS_SEEN_MS = Number(process.env.OPENCODE_MODELS_SEEN_MS ?? 1_800_000);
const seenAt = new Map();

function rememberSeen(ids) {
  const now = Date.now();
  for (const id of ids) seenAt.set(id, now);
  for (const [id, at] of seenAt) if (now - at > MODELS_SEEN_MS) seenAt.delete(id);
  return [...seenAt.keys()].sort();
}

const ACCESS_DENIED = /free tier|can only be used|unauthor|forbidden|\b401\b|\b403\b/i;
const RATE_LIMITED = /rate.?limit|FreeUsageLimit|quota|\b429\b/i;

// Trần hàng đợi. Đầy thì trả 429 NGAY để chuỗi dự phòng của app đổi model, thay vì để request chờ tới hết timeout phía app.
// Đo 2026-09-30: không có trần thì hàng đợi lên 21 việc, mọi lượt gọi hết giờ đúng 90s và không lượt nào qua suốt một ngày.
const MAX_QUEUE = Number(process.env.OPENCODE_MAX_QUEUE ?? 2);

let running = 0;
const waiting = [];

// Hàng đợi tự viết thay vì thư viện: cả file này cố ý không có dependency nào.
function acquire(signal) {
  if (signal?.aborted) return Promise.reject(new CliError('client đã ngắt trước khi tới lượt', 499));
  if (running < MAX_CONCURRENCY) {
    running += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_QUEUE) {
    return Promise.reject(
      new CliError(`rate limit exceeded: hàng đợi opencode-service đầy (${waiting.length}/${MAX_QUEUE})`, 429),
    );
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve };
    waiting.push(entry);
    // Client bỏ đi khi còn xếp hàng thì GỠ khỏi hàng: không thì tới lượt vẫn chạy CLI trọn vẹn cho một người gọi đã không còn.
    signal?.addEventListener(
      'abort',
      () => {
        const index = waiting.indexOf(entry);
        if (index === -1) return;
        waiting.splice(index, 1);
        reject(new CliError('client đã ngắt khi còn trong hàng đợi', 499));
      },
      { once: true },
    );
  });
}

function release() {
  const next = waiting.shift();
  if (next) return next.resolve();
  running -= 1;
}

// --- Tiến trình `opencode serve` dùng chung, sống suốt vòng đời service ---

let serveReady = false;
let serveProcess = null;

function startServe() {
  serveReady = false;
  const child = spawn(CLI_BIN, ['serve', '--port', String(SERVE_PORT), '--hostname', '127.0.0.1'], {
    cwd: WORK_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serveProcess = child;

  child.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('listening on')) serveReady = true;
  });
  child.on('error', (error) => {
    console.error(`opencode serve lỗi: ${error.message}`);
  });
  child.on('close', (code) => {
    serveReady = false;
    console.error(`opencode serve thoát mã ${code}, khởi động lại sau ${SERVE_RESTART_DELAY_MS}ms`);
    setTimeout(startServe, SERVE_RESTART_DELAY_MS);
  });
}

// Dọn session ngay sau khi đọc xong kết quả - không dọn thì bộ nhớ của `serve` tích luỹ tới OOM (đã đo thật 2026-10-04: oom_kill=2 sau một đợt tải không dọn).
function deleteSession(id) {
  if (!id) return;
  fetch(`${SERVE_URL}/session/${id}`, { method: 'DELETE' }).catch(() => {});
}

// Hỏi thẳng CLI thay vì chép danh mục: bản hardcode đã sai cả hai chiều một lần rồi.
function listModels() {
  if (Date.now() - modelsCache.at < MODELS_TTL_MS && modelsCache.ids.length) {
    return Promise.resolve(modelsCache.ids);
  }
  return new Promise((resolve) => {
    const child = spawn(CLI_BIN, ['models'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.on('error', () => {});
    child.on('close', () => {
      clearTimeout(timer);
      // `opencode/<id>` rút gọn thành `<id>` vì app đã tách tiền tố lõi từ trước; lõi khác giữ nguyên.
      const ids = out
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.includes('/'))
        .map((line) => (line.startsWith('opencode/') ? line.slice('opencode/'.length) : line));
      if (!ids.length) return resolve(FALLBACK_MODELS);
      modelsCache = { at: Date.now(), ids: rememberSeen(ids) };
      resolve(modelsCache.ids);
    });
  });
}

/** `opencode` đòi dạng `<lõi>/<model>`; id không có `/` thì mặc định là bể Zen. */
function cliModelId(model) {
  const id = String(model ?? '').trim();
  if (!id) return 'opencode/big-pickle';
  return id.includes('/') ? id : `opencode/${id}`;
}

/** Ép hội thoại về MỘT chuỗi: `opencode run` nhận đúng một message. */
function flatten(messages) {
  if (!Array.isArray(messages)) return '';
  return messages
    .map((m) => {
      const content =
        typeof m?.content === 'string'
          ? m.content
          : Array.isArray(m?.content)
            ? m.content.map((p) => p?.text ?? '').join('')
            : '';
      if (!content.trim()) return '';
      if (m.role === 'system') return content;
      if (m.role === 'assistant') return `[trợ lý đã trả lời]\n${content}`;
      return content;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

class CliError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Nội dung chữ cuối cùng của một session, đọc qua API của `serve` - đáng tin hơn stdout của `run --attach`, vốn chỉ in sự kiện đầu tiên rồi dừng (đã đo thật 2026-10-04). */
async function finalTextOf(sessionId) {
  const msgs = await fetch(`${SERVE_URL}/session/${sessionId}/message`).then((r) => r.json());
  const assistant = [...msgs].reverse().find((m) => m.info?.role === 'assistant');
  return (assistant?.parts ?? []).map((p) => p.text ?? '').join('');
}

async function usageOfSession(sessionId) {
  const session = await fetch(`${SERVE_URL}/session/${sessionId}`).then((r) => r.json());
  return session.tokens ?? null;
}

/**
 * Chạy một lượt qua `opencode run --attach`, gắn vào `serve` dùng chung.
 */
function runCli({ model, message, signal }) {
  return new Promise((resolve, reject) => {
    if (!serveReady) {
      return reject(new CliError('opencode serve chưa sẵn sàng, thử lại sau', 503));
    }

    const args = ['run', message, '--attach', SERVE_URL, '--model', model, '--format', 'json'];

    // stdin PHẢI đóng: không có TTY mà để ngỏ thì CLI treo tới hết timeout, không in gì.
    const child = spawn(CLI_BIN, args, { cwd: WORK_DIR, stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    let stderr = '';
    let sessionId = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new CliError(`CLI không xong trong ${TIMEOUT_MS}ms`, 504));
    }, TIMEOUT_MS);

    // App hết giờ (90s) sớm hơn TIMEOUT_MS (180s): không giết tiến trình thì nó giữ một trong các chỗ thêm tới 90s cho một người gọi đã bỏ đi.
    const onAbort = () => {
      child.kill('SIGKILL');
      finish(reject, new CliError('client đã ngắt, huỷ tiến trình CLI', 499));
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim() || sessionId) continue;
        try {
          const event = JSON.parse(line);
          if (event?.sessionID) sessionId = event.sessionID;
        } catch {
          // Dòng không phải JSON là log của CLI, bỏ qua.
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => finish(reject, new CliError(error.message, 502)));

    child.on('close', async (code) => {
      const blob = `${stderr}\n${buffer}`;

      if (ACCESS_DENIED.test(blob)) {
        return finish(reject, new CliError(blob.trim().slice(0, 300), 403));
      }
      if (RATE_LIMITED.test(blob)) {
        return finish(reject, new CliError(blob.trim().slice(0, 300), 429));
      }
      if (!sessionId) {
        return finish(
          reject,
          new CliError(`CLI thoát mã ${code} không rõ session: ${stderr.trim().slice(0, 300)}`, 502),
        );
      }

      try {
        const [text, usage] = await Promise.all([finalTextOf(sessionId), usageOfSession(sessionId)]);
        if (!text.trim()) {
          return finish(reject, new CliError('CLI không trả về nội dung nào', 502));
        }
        finish(resolve, { text, usage, sessionId });
      } catch (error) {
        finish(reject, new CliError(`đọc kết quả từ serve thất bại: ${error.message}`, 502));
      } finally {
        deleteSession(sessionId);
      }
    });
  });
}

function usageOf(tokens) {
  const cached = tokens?.cache?.read ?? 0;
  const input = (tokens?.input ?? 0) + cached;
  const output = tokens?.output ?? 0;
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: tokens?.total ?? input + output,
    prompt_tokens_details: { cached_tokens: cached },
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: { message, type: 'opencode_service_error' } });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new CliError('thân request quá lớn', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function completions(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return sendError(res, error.status ?? 400, `thân request không hợp lệ: ${error.message}`);
  }

  const message = flatten(body.messages);
  if (!message.trim()) return sendError(res, 400, 'messages rỗng');
  if (message.length > MESSAGE_LIMIT) {
    return sendError(res, 413, `prompt ${message.length} ký tự, quá trần ${MESSAGE_LIMIT}`);
  }

  const model = cliModelId(body.model);
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const streaming = body.stream === true;

  // `close` của res cũng bắn sau khi trả xong bình thường; chỉ coi là ngắt khi phản hồi CHƯA kết thúc.
  const disconnect = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) disconnect.abort();
  });
  const { signal } = disconnect;

  try {
    await acquire(signal);
  } catch (error) {
    if (!res.writableEnded && !signal.aborted) sendError(res, error.status ?? 503, error.message);
    return;
  }

  try {
    const { text, usage } = await runCli({ model, message, signal });

    if (!streaming) {
      return sendJson(res, 200, {
        id,
        object: 'chat.completion',
        created,
        model: body.model ?? model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: text },
            finish_reason: 'stop',
          },
        ],
        usage: usageOf(usage),
      });
    }

    const chunk = (delta, finish_reason = null) =>
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model: body.model ?? model,
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;

    // `run --attach` không chuyển tiếp từng mảnh chữ ra stdout theo thời gian thực (đã đo 2026-10-04) - gửi cả khối MỘT LẦN, giống hành vi "không stream được" mà `AiService` đã chấp nhận từ trước cho lõi này.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(chunk({ role: 'assistant', content: text }));
    res.write(chunk({}, 'stop'));
    res.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model: body.model ?? model,
        choices: [],
        usage: usageOf(usage),
      })}\n\n`,
    );
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    // Client đã đi thì không còn ai để trả lời.
    if (signal.aborted) return;
    const status = error.status ?? 502;
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    sendError(res, status, error.message);
  } finally {
    release();
  }
}

const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];

  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    return sendJson(res, 200, { ok: true, serveReady, running, queued: waiting.length });
  }

  if (req.method === 'GET' && path === '/v1/models') {
    return void listModels().then((ids) =>
      sendJson(res, 200, {
        object: 'list',
        data: ids.map((model) => ({
          id: model,
          object: 'model',
          owned_by: 'opencode',
        })),
      }),
    );
  }

  if (req.method === 'POST' && path === '/v1/chat/completions') {
    return void completions(req, res);
  }

  sendError(res, 404, `không có đường ${req.method} ${path}`);
});

server.headersTimeout = TIMEOUT_MS + 30_000;
server.requestTimeout = TIMEOUT_MS + 30_000;

startServe();

server.listen(PORT, () => {
  console.log(`opencode-service nghe cổng ${PORT}, tối đa ${MAX_CONCURRENCY} tiến trình, gắn vào serve nội bộ cổng ${SERVE_PORT}`);
});

process.on('SIGTERM', () => {
  serveProcess?.removeAllListeners('close');
  serveProcess?.kill('SIGTERM');
  server.close(() => process.exit(0));
});
