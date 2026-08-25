import { kilo } from './kilo.js';
import { opencode } from './opencode.js';
import { openrouter } from './openrouter.js';
import type { ProviderDescriptor } from './types.js';

/**
 * Mọi lõi hệ thống biết. **Thêm lõi mới = thêm một file rồi thêm một dòng ở
 * đây.** Không có class nào phải viết, không có gì phải đăng ký với Nest.
 */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  opencode,
  openrouter,
  kilo,
];

/** Danh sách id, dùng để tách chuỗi `lõi/model`. */
export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}

export function findProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export type { ProviderDescriptor } from './types.js';
