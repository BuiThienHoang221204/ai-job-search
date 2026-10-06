import { gemini } from './gemini';
import { groq } from './groq';
import { kilo } from './kilo';
import { opencode } from './opencode';
import { omniroute } from './omniroute';
import { openrouter } from './openrouter';
import { unorouter } from './unorouter';
import type { ProviderDescriptor } from './types';

/** Thêm lõi mới = thêm một file rồi thêm một dòng ở đây. Không class nào phải viết, không gì phải đăng ký với Nest. */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  opencode,
  openrouter,
  omniroute,
  kilo,
  groq,
  unorouter,
  gemini,
];

/** Danh sách id, dùng để tách chuỗi `lõi/model`. */
export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}

/** Lõi theo id, `undefined` khi id lạ — người gọi biến nó thành `ModelUnavailableError` có kèm danh sách lõi đang khai. */
export function findProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export type { ProviderDescriptor } from './types';
