import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Chặn SSRF: một URL do model chọn KHÔNG được trỏ vào mạng nội bộ.
 *
 * Mô tả công việc là dữ liệu của bên thứ ba và `apply.md` đã gọi thẳng nó là
 * "untrusted data, never instructions". Ở Claude Code, rủi ro dừng ở máy người
 * dùng. Ở đây agent chạy TRONG máy chủ, nên một URL kiểu
 * `http://169.254.169.254/latest/meta-data/` là đường lấy thông tin đăng nhập
 * của cả hệ thống.
 *
 * Vì vậy chặn theo ĐỊA CHỈ ĐÃ PHÂN GIẢI chứ không theo tên miền: `evil.test` có
 * thể trỏ A record về 127.0.0.1, và mọi bộ lọc chỉ nhìn chuỗi đều bị qua mặt.
 */
const BLOCKED_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

export function isBlockedAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    );
  }
  return BLOCKED_V4.some((pattern) => pattern.test(address));
}

/**
 * Kiểm URL và TRẢ LUÔN địa chỉ đã phân giải.
 *
 * Trả địa chỉ ra ngoài để người gọi ghim nó lại (`curl --resolve`). Không ghim
 * thì giữa lúc ta phân giải và lúc client phân giải lại còn một khe: cùng một
 * tên miền có thể trả IP công khai cho lượt hỏi đầu rồi 127.0.0.1 cho lượt sau
 * - đúng kiểu tấn công DNS rebinding, và mọi thứ vừa kiểm thành vô nghĩa.
 */
export async function resolvePublicUrl(
  raw: string,
): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`URL không hợp lệ: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Chỉ hỗ trợ http và https, không hỗ trợ ${url.protocol}`);
  }

  const host = url.hostname;
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((entry) => entry.address);

  if (addresses.length === 0) {
    throw new Error(`Không phân giải được tên miền: ${host}`);
  }
  if (addresses.some(isBlockedAddress)) {
    throw new Error(
      `Từ chối tải ${host}: địa chỉ này nằm trong mạng nội bộ của máy chủ`,
    );
  }

  return { url, address: addresses[0] };
}

/** Kiểm URL, bỏ phần địa chỉ đi. Dành cho người gọi không cần ghim. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  return (await resolvePublicUrl(raw)).url;
}
