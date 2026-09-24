/**
 * Gọi model qua cổng OpenAI-compatible, có chuỗi dự phòng và chịu được 429.
 *
 * Dùng chung cho các script chạy tay hàng loạt. Cùng ý tưởng với `ModelChain`
 * của `AiService` — hỏng ở một model thì đi tiếp mắt xích sau — nhưng viết
 * riêng vì script chạy ngoài Nest, không dựng được cả application context chỉ
 * để gọi vài nghìn lượt.
 *
 * Bài học đã trả giá: lượt dịch đầu tiên chạy 45 phút rồi ăn 429 và mất trắng
 * 3.173 câu vì chỉ gọi đúng `MODEL_ID`, trong khi `.env` khai sẵn 5 model dự
 * phòng mà script không hề dùng tới.
 */

import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tiền tố chọn đường CLI. `opencode-cli/big-pickle` chạy `opencode run --model opencode/big-pickle`. */
const CLI_PREFIX = 'opencode-cli/';

const CLI_BIN = process.env.OPENCODE_CLI_BIN ?? 'opencode';
const CLI_TIMEOUT_MS = Number(process.env.OPENCODE_CLI_TIMEOUT_MS ?? 180_000);

/** Trần argv của Windows là 32767 ký tự; vượt thì lỗi báo ra rất khó truy. */
const CLI_MESSAGE_LIMIT = 30_000;

const CLI_RATE_LIMITED = /429|rate.?limit|FreeUsageLimit|free tier|quota/i;

/** CLI báo hết hạn mức bằng chữ trong stdout/stderr chứ không có mã HTTP. */
class CliRateLimited extends Error {}

/** Gom theo id của part: một part được cập nhật nhiều lần khi chữ chảy dần, lấy bản cuối. */
function collectCliText(stdout) {
  const parts = new Map();
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== 'text') continue;
    const part = event.part;
    if (part?.id && typeof part.text === 'string') parts.set(part.id, part.text);
  }
  return [...parts.values()].join('');
}

/** Chạy một lượt qua CLI. `temperature` bị BỎ QUA vì `opencode run` không có cờ tương ứng. */
function callViaCli({ model, system, user }) {
  const message = system ? `${system}\n\n---\n\n${user}` : user;
  if (message.length > CLI_MESSAGE_LIMIT) {
    return Promise.reject(
      new Error(`prompt ${message.length} ký tự, quá trần argv ${CLI_MESSAGE_LIMIT}`),
    );
  }

  const args = ['run', message, '--model', model, '--format', 'json'];
  if (process.env.OPENCODE_CLI_AGENT) {
    args.push('--agent', process.env.OPENCODE_CLI_AGENT);
  }
  if (process.env.OPENCODE_CLI_DIR) {
    args.push('--dir', process.env.OPENCODE_CLI_DIR);
  }

  return new Promise((resolve, reject) => {
    // stdin PHẢI đóng: không có TTY mà vẫn để ngỏ thì CLI treo tới hết timeout, không in gì.
    const child = spawn(CLI_BIN, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error(`CLI không xong trong ${CLI_TIMEOUT_MS}ms`));
    }, CLI_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => {
      if (CLI_RATE_LIMITED.test(`${out}\n${err}`)) {
        return finish(reject, new CliRateLimited('CLI báo hết hạn mức'));
      }
      if (code !== 0) {
        return finish(reject, new Error(`CLI thoát mã ${code}: ${err.trim().slice(0, 200)}`));
      }
      finish(resolve, collectCliText(out));
    });
  });
}

/**
 * `SCRIPT_MODEL_IDS` ghi đè chuỗi cho RIÊNG các script chạy tay, không đụng tới
 * `MODEL_ID` mà server đang dùng. Cần thiết vì hai bên có thể phải chạy hai
 * model khác nhau trong lúc bể free của một nhà cung cấp đang hỏng.
 */
export function modelChain() {
  const override = (process.env.SCRIPT_MODEL_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (override.length) return override;

  const fallbacks = (process.env.MODEL_FALLBACK_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return [process.env.MODEL_ID, ...fallbacks].filter(Boolean);
}

/**
 * Gộp các mảnh `data:` của một phản hồi dạng luồng. Cổng bỏ qua `stream: false`
 * trong một số cấu hình nên phải chịu được cả hai dạng.
 */
function readBody(body) {
  if (!body.startsWith('data:')) {
    return JSON.parse(body).choices?.[0]?.message?.content ?? '';
  }
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:') && !line.includes('[DONE]'))
    .map((line) => {
      try {
        return JSON.parse(line.slice(5)).choices?.[0]?.delta?.content ?? '';
      } catch {
        return '';
      }
    })
    .join('');
}

export class RateLimited extends Error {
  constructor(retryAfterMs) {
    super('mọi model trong chuỗi đều đang bị chặn hạn mức');
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Trả về `{ text, modelId }`. Ném `RateLimited` khi CẢ chuỗi đều trả 429 —
 * nơi gọi tự quyết chờ bao lâu, vì chỉ nó biết còn bao nhiêu việc.
 */
/**
 * Chọn điểm cuối theo tiền tố của model id, tách ở dấu `/` ĐẦU TIÊN — cùng quy
 * ước với `ModelChain` của `AiService`.
 *
 * `openrouter/*` đi THẲNG tới openrouter.ai chứ không qua OmniRoute. Ngày
 * 2026-09-07 cổng OmniRoute còn sống nhưng cả 6 họ model của nó đều hỏng:
 * `oc/*` trả "OpenCode's free tier can only be used in OpenCode", `tllm/*` bị
 * Vercel chặn theo IP, `aug/*` đòi CLI chưa cài. Đi thẳng là đường DUY NHẤT
 * còn chạy được, và repo vốn đã có lõi `openrouter`.
 */
function endpointFor(modelId) {
  if (modelId.startsWith('openrouter/')) {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_API_KEY,
      model: modelId.slice('openrouter/'.length),
    };
  }
  return {
    url: `${process.env.OMNIROUTE_BASE_URL}/chat/completions`,
    key: process.env.OMNIROUTE_API_KEY,
    model: modelId,
  };
}

export async function callModel({ system, user, temperature = 0.3, attempts = 2 }) {
  const chain = modelChain();
  let lastError = null;
  let sawRateLimit = false;
  let retryAfterMs = 60_000;

  for (const modelId of chain) {
    for (let attempt = 0; attempt <= attempts; attempt++) {
      if (modelId.startsWith(CLI_PREFIX)) {
        try {
          const text = await callViaCli({
            model: modelId.slice(CLI_PREFIX.length),
            system,
            user,
          });
          if (!text.trim()) throw new Error('phản hồi rỗng');
          return { text, modelId };
        } catch (err) {
          if (err instanceof CliRateLimited) {
            sawRateLimit = true;
            break;
          }
          lastError = err;
          if (attempt < attempts) await sleep(1500 * (attempt + 1));
        }
        continue;
      }

      const endpoint = endpointFor(modelId);
      if (!endpoint.key) break;
      try {
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${endpoint.key}`,
            'User-Agent': process.env.OMNIROUTE_USER_AGENT ?? 'opencode',
          },
          body: JSON.stringify({
            model: endpoint.model,
            stream: false,
            temperature,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });

        if (res.status === 429) {
          sawRateLimit = true;
          const header = Number(res.headers.get('retry-after'));
          if (Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;
          break;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = readBody(await res.text());
        if (!text.trim()) throw new Error('phản hồi rỗng');
        return { text, modelId };
      } catch (err) {
        lastError = err;
        if (attempt < attempts) await sleep(1500 * (attempt + 1));
      }
    }
  }

  if (sawRateLimit) throw new RateLimited(retryAfterMs);
  throw lastError ?? new Error('không model nào trả lời');
}

export function extractJson(text, open = '{', close = '}') {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf(open);
  const end = body.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
