import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import { resolvePublicUrl } from './public-url';
import { messageOf } from '../error-message';

const run = promisify(execFile);

const MAX_HOPS = 4;

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi,en;q=0.9',
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export type PageResponse = {
  url: string;
  status: number;
  body: string;
};

export class HttpGetError extends Error {}

export function splitTrailer(stdout: string): {
  body: string;
  status: number;
  next: string;
} {
  const cut = stdout.lastIndexOf('\n');
  const trailer = cut === -1 ? stdout : stdout.slice(cut + 1);
  const [code, location = ''] = trailer.trim().split(/\s+/);

  return {
    body: cut === -1 ? '' : stdout.slice(0, cut),
    status: Number(code) || 0,
    next: location,
  };
}

export function pinArgs(url: URL, address: string): string[] {
  if (isIP(url.hostname)) return [];

  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const target = isIP(address) === 6 ? `[${address}]` : address;
  return ['--resolve', `${url.hostname}:${port}:${target}`];
}

async function curlOnce(
  url: URL,
  address: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ body: string; status: number; next: string }> {
  const args = [
    '-sS',
    '--max-time',
    String(Math.ceil(timeoutMs / 1000)),
    '-w',
    '\n%{http_code} %{redirect_url}',
    ...pinArgs(url, address),
  ];
  for (const [name, value] of Object.entries(HEADERS)) {
    args.push('-H', `${name}: ${value}`);
  }
  args.push(url.toString());

  try {
    const { stdout } = await run('curl', args, {
      maxBuffer: maxBytes * 2,
      timeout: timeoutMs + 2_000,
    });
    const page = splitTrailer(stdout);
    return { ...page, body: page.body.slice(0, maxBytes) };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'ENOENT' || code === 127) {
      throw new HttpGetError(
        'Máy chủ không có lệnh `curl` nên không tải được trang web nào.',
      );
    }
    throw new HttpGetError(`Không tải được trang: ${messageOf(error)}`);
  }
}

/** Tải trang và theo chuyển hướng, kiểm địa chỉ công khai ở TỪNG chặng. */
export async function fetchPage(
  target: string,
  options: { timeoutMs: number; maxBytes: number },
): Promise<PageResponse> {
  let hop = await resolvePublicUrl(target);

  for (let index = 0; index < MAX_HOPS; index += 1) {
    const { body, status, next } = await curlOnce(
      hop.url,
      hop.address,
      options.timeoutMs,
      options.maxBytes,
    );

    if (!REDIRECTS.has(status) || !next) {
      return { url: hop.url.toString(), status, body };
    }
    hop = await resolvePublicUrl(next);
  }

  throw new HttpGetError(`Trang chuyển hướng quá ${MAX_HOPS} lần: ${target}`);
}
