import { createHash } from 'node:crypto';

/** sha256 của các phần nối liền nhau rồi cắt `length` ký tự hex — nhiều hash đã LƯU trong database, đổi cách băm là mọi cache cũ thành "đã thay đổi". */
export function fingerprint(parts: readonly string[], length = 32): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex').slice(0, length);
}
