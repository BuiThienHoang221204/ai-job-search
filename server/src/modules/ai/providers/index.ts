import { gemini } from './gemini';
import { groq } from './groq';
import { kilo } from './kilo';
import { opencode } from './opencode';
import { omniroute } from './omniroute';
import { openrouter } from './openrouter';
import { unorouter } from './unorouter';
import type { ProviderDescriptor } from './types';

export const PROVIDERS: readonly ProviderDescriptor[] = [
  opencode,
  openrouter,
  omniroute,
  kilo,
  groq,
  unorouter,
  gemini,
];

export function providerIds(): string[] {
  return PROVIDERS.map((provider) => provider.id);
}

export function findProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export type { ProviderDescriptor } from './types';
