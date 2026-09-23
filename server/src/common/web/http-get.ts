import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import { resolvePublicUrl } from './public-url.js';

const run = promisify(execFile);

/**
 * Tải một trang bằng `curl`, KHÔNG bằng `fetch` của Node.
 *
 * Cloudflare - thứ đứng trước phần lớn portal tuyển dụng Việt Nam - nhận dạng
 * client qua **vân tay TLS (JA3)**, không chỉ qua header. Bắt tay TLS của Node
 * bị xếp là bot. Đo trên `topcv.vn` ngày 2026-08-22, cùng URL: curl trả 200,
 * còn `fetch` trả 403 với mọi tổ hợp User-Agent, Accept và Accept-Encoding đã
 * thử. Vấn đề nằm DƯỚI tầng HTTP nên không header nào cứu được.
 *
 * Đây đúng kết luận mà `.agents/skills/topcv-search` đã trả giá để có, và là lý
 * do CLI quét tin đêm gọi curl. Cái giá: máy chủ phải có `curl` - điều kiện vốn
 * đã tồn tại từ khi có portal đó.
 */

/** Trần số chặng chuyển hướng. Đủ cho mọi trang thật, chặn được vòng lặp. */
const MAX_HOPS = 4;

/**
 * Khai như một trình duyệt. CẦN, nhưng một mình thì KHÔNG ĐỦ.
 *
 * Đo cùng lúc trên `topcv.vn`: curl không kèm User-Agent trả 403, curl kèm
 * User-Agent này trả 200, còn `fetch` của Node kèm đúng chuỗi đó vẫn 403. Tức
 * là phải qua cả hai cửa - vân tay TLS và header - nên đừng bỏ khối này đi khi
 * thấy "curl chạy được rồi".
 */
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi,en;q=0.9',
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export type PageResponse = {
  /** URL cuối cùng, sau khi đã đi hết chuyển hướng. */
  url: string;
  status: number;
  body: string;
};

export class HttpGetError extends Error {}

/**
 * Tách dòng cuối do `-w` ghi ra khỏi thân trang.
 *
 * `%{redirect_url}` là URL curl **sẽ** đi nếu có `-L`, nên lấy được chặng kế
 * tiếp mà không phải phân tích header.
 */
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

/**
 * Ghim tên miền vào đúng địa chỉ vừa kiểm, đóng khe DNS rebinding.
 *
 * Trả mảng rỗng khi host vốn đã là IP - `--resolve` khi đó vô nghĩa.
 */
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
    // KHÔNG dùng `-L`: chuyển hướng được đi thủ công để mỗi chặng đều qua
    // `resolvePublicUrl`. Để curl tự đi thì một redirect tới 169.254.169.254 sẽ
    // lọt, vì chỉ URL đầu tiên được xét.
    '-w',
    '\n%{http_code} %{redirect_url}',
    ...pinArgs(url, address),
  ];
  for (const [name, value] of Object.entries(HEADERS)) {
    args.push('-H', `${name}: ${value}`);
  }
  // Tham số dạng MẢNG, không nối chuỗi vào shell: URL do model chọn.
  args.push(url.toString());

  try {
    // Trần bộ nhớ để RỘNG HƠN trần nội dung, rồi mới cắt: `maxBuffer` chạm
    // trần là execFile giết tiến trình và NÉM, tức một trang quá khổ sẽ mất
    // hẳn thay vì bị cắt bớt như bản `fetch` cũ. Trang tìm việc của TopCV đã
    // 1,80 MB trên trần 2 MB, nên khe này hẹp thật chứ không phải giả định.
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
    throw new HttpGetError(
      `Không tải được trang: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Tải một trang và đi theo chuyển hướng, kiểm địa chỉ ở TỪNG chặng.
 *
 * Kiểm lại mỗi chặng chứ không chỉ chặng đầu: đó là chỗ cả bản `fetch` cũ lẫn
 * `curl -L` đều hở - một trang công khai chuyển hướng sang địa chỉ nội bộ sẽ đi
 * lọt nếu chỉ URL người dùng đưa được xét.
 */
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
