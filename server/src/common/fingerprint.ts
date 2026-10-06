import { createHash } from 'node:crypto';

/** Hash đã LƯU trong database: đổi cách băm là mọi cache cũ thành "đã thay đổi". */
export function fingerprint(parts: readonly string[], length = 32): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex').slice(0, length);
}
