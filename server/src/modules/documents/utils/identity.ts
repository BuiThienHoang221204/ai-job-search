import type { Identity } from '../content.types';

const KEYS = ['name', 'email', 'phone', 'location', 'title'] as const;

/** Phần đầu CV người dùng sửa riêng đè lên tài khoản/hồ sơ: khoá vắng mặt giữ bản gốc, chuỗi rỗng là cố ý ẩn. */
export function mergeIdentity(base: Identity, saved: unknown): Identity {
  if (!saved || typeof saved !== 'object') return base;
  const edits = saved as Record<string, unknown>;
  const merged = { ...base };
  for (const key of KEYS) {
    const value = edits[key];
    if (typeof value === 'string') merged[key] = value;
  }
  return merged;
}
