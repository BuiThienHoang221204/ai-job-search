import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

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
// Dải không định tuyến ra Internet; địa chỉ IPv4 nằm trong IPv6 (::ffff:a.b.c.d) BlockList tự đối chiếu với luật IPv4.
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv6');

export function isBlockedAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family === 0) return true;
  return BLOCKED.check(bare, family === 6 ? 'ipv6' : 'ipv4');
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

  // Hostname IPv6 của URL còn ngoặc vuông ([::1]); bỏ ra để isIP nhận diện được.
  const host = url.hostname.replace(/^\[|\]$/g, '');
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
