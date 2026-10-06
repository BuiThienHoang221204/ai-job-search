import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

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

/** Kiểm URL công khai và trả địa chỉ đã phân giải để ghim lại, chặn DNS rebinding. */
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
