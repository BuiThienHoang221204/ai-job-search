import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const CLI_BIN = process.env.OPENCODE_CLI_BIN ?? 'opencode';
const WORK_DIR = process.env.OPENCODE_WORK_DIR ?? '/work';
const TIMEOUT_MS = Number(process.env.OPENCODE_TIMEOUT_MS ?? 180_000);

// Trần tiến trình chạy cùng lúc. Đã đo ~259MB RSS mỗi tiến trình, nên 2 là vừa với `memory: 2G`.
const MAX_CONCURRENCY = Number(process.env.OPENCODE_MAX_CONCURRENCY ?? 2);

// Trần argv. Đặt thấp hơn trần thật để chừa chỗ cho các cờ đi kèm.
const MESSAGE_LIMIT = Number(process.env.OPENCODE_MESSAGE_LIMIT ?? 100_000);

// Danh sách dự phòng, chỉ dùng khi `opencode models` không chạy được.
const FALLBACK_MODELS = (process.env.OPENCODE_MODELS ?? 'big-pickle')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const MODELS_TTL_MS = Number(process.env.OPENCODE_MODELS_TTL_MS ?? 300_000);
let modelsCache = { at: 0, ids: [] };

const ACCESS_DENIED = /free tier|can only be used|unauthor|forbidden|\b401\b|\b403\b/i;
const RATE_LIMITED = /rate.?limit|FreeUsageLimit|quota|\b429\b/i;

let running = 0;
const waiting = [];

// Hàng đợi tự viết thay vì thư viện: cả file này cố ý không có dependency nào.
function acquire() {
  if (running < MAX_CONCURRENCY) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) return next();
  running -= 1;
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
      if (ids.length) modelsCache = { at: Date.now(), ids };
      resolve(ids.length ? ids : FALLBACK_MODELS);
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

/**
 * Chạy một lượt CLI, gọi `onDelta` với phần chữ MỚI của mỗi mảnh.
 */
function runCli({ model, message, onDelta }) {
  return new Promise((resolve, reject) => {
    const args = [
      'run',
      message,
      '--model',
      model,
      '--format',
      'json',
      '--dir',
      WORK_DIR,
    ];

    // stdin PHẢI đóng: không có TTY mà để ngỏ thì CLI treo tới hết timeout, không in gì.
    const child = spawn(CLI_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const emitted = new Map();
    let buffer = '';
    let stderr = '';
    let usage = null;
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

    const handleEvent = (event) => {
      if (event?.type === 'text' && event.part?.id) {
        const full = typeof event.part.text === 'string' ? event.part.text : '';
        const seen = emitted.get(event.part.id) ?? '';
        if (full.length > seen.length && full.startsWith(seen)) {
          const delta = full.slice(seen.length);
          emitted.set(event.part.id, full);
          onDelta?.(delta);
        } else if (full !== seen) {
          emitted.set(event.part.id, full);
          onDelta?.(full);
        }
        return;
      }
      if (event?.type === 'step_finish' && event.part?.tokens) {
        usage = event.part.tokens;
      }
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          // Dòng không phải JSON là log của CLI, bỏ qua.
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => finish(reject, new CliError(error.message, 502)));

    child.on('close', (code) => {
      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer));
        } catch {
          // như trên
        }
      }

      const text = [...emitted.values()].join('');
      const blob = `${stderr}\n${text}`;

      if (ACCESS_DENIED.test(blob)) {
        return finish(reject, new CliError(blob.trim().slice(0, 300), 403));
      }
      if (RATE_LIMITED.test(blob)) {
        return finish(reject, new CliError(blob.trim().slice(0, 300), 429));
      }
      if (code !== 0) {
        return finish(
          reject,
          new CliError(`CLI thoát mã ${code}: ${stderr.trim().slice(0, 300)}`, 502),
        );
      }
      if (!text.trim()) {
        return finish(reject, new CliError('CLI không trả về nội dung nào', 502));
      }
      finish(resolve, { text, usage });
    });
  });
}

function usageOf(tokens) {
  return {
    prompt_tokens: tokens?.input ?? 0,
    completion_tokens: tokens?.output ?? 0,
    total_tokens: tokens?.total ?? 0,
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

  await acquire();
  try {
    if (!streaming) {
      const { text, usage } = await runCli({ model, message });
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

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const chunk = (delta, finish_reason = null) =>
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model: body.model ?? model,
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`;

    res.write(chunk({ role: 'assistant', content: '' }));

    const { usage } = await runCli({
      model,
      message,
      onDelta: (delta) => res.write(chunk({ content: delta })),
    });

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
    return sendJson(res, 200, { ok: true, running, queued: waiting.length });
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

server.listen(PORT, () => {
  console.log(`opencode-service nghe cổng ${PORT}, tối đa ${MAX_CONCURRENCY} tiến trình`);
});
