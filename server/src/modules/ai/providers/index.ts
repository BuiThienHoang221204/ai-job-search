import { gemini } from './gemini';
import { groq } from './groq';
import { kilo } from './kilo';
import { motapis } from './motapis';
import { opencode } from './opencode';
import { opencodeDirect } from './opencode-direct';
import { omniroute } from './omniroute';
import { openrouter } from './openrouter';
import { unorouter } from './unorouter';
import type { ProviderDescriptor } from './types';

export const PROVIDERS: readonly ProviderDescriptor[] = [
  opencodeDirect,
  opencode,
  openrouter,
  omniroute,
  kilo,
  groq,
  unorouter,
  gemini,
  motapis,
];

export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}

export function findProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export type { ProviderDescriptor } from './types';
