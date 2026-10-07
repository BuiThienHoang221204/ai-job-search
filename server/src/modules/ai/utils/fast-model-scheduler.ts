import { HOUR_MS } from '@/common/duration';
import { findProvider, providerIds } from '../providers/index';
import type { RateLimitSpec } from '../providers/types';
import { formatModelRef, parseModelRef } from './model-ref';

const RETENTION_MS = 25 * HOUR_MS;

const CHARS_PER_TOKEN = 3.5;

const SCHEMA_OVERHEAD_TOKENS = 1200;

/** Ước CAO hơn số token Groq đếm (đo 2026-10-07: tiếng Việt 3,67 ký tự/token, tiếng Anh 4,3, JSON Schema bơm vào prompt ~1.080 token). */
export function estimateTokens(system: string, prompt: string): number {
  return (
    Math.ceil((system.length + prompt.length) / CHARS_PER_TOKEN) +
    SCHEMA_OVERHEAD_TOKENS
  );
}

type Usage = { at: number; tokens: number };

const usages = new Map<string, Usage[]>();

function canonical(ref: string, defaultProviderId: string): string {
  return formatModelRef(parseModelRef(ref, providerIds(), defaultProviderId));
}

function hasRoomFor(
  spec: RateLimitSpec,
  key: string,
  estimatedTokens: number,
  now: number,
): boolean {
  const recent = (usages.get(key) ?? []).filter(
    (u) => now - u.at < spec.windowMs,
  );

  if (spec.kind === 'count') {
    return recent.length < spec.limit;
  }

  const used = recent.reduce((sum, u) => sum + u.tokens, 0);
  return used + estimatedTokens <= spec.limit;
}

function hasRoom(key: string, estimatedTokens: number, now: number): boolean {
  const slash = key.indexOf('/');
  const providerId = key.slice(0, slash);
  const modelId = key.slice(slash + 1);
  const specs = findProvider(providerId)?.rateLimitFor?.(modelId);
  if (!specs?.length) return true;

  return specs.every((spec) => hasRoomFor(spec, key, estimatedTokens, now));
}

export function pickStart(
  candidates: readonly string[],
  estimatedTokens: number,
  defaultProviderId: string,
  now = Date.now(),
): string | undefined {
  for (const candidate of candidates) {
    const key = canonical(candidate, defaultProviderId);
    if (hasRoom(key, estimatedTokens, now)) return candidate;
  }
  return undefined;
}

export function markUsed(
  providerModelKey: string,
  estimatedTokens: number,
  now = Date.now(),
): void {
  const recent = (usages.get(providerModelKey) ?? []).filter(
    (u) => now - u.at < RETENTION_MS,
  );
  recent.push({ at: now, tokens: estimatedTokens });
  usages.set(providerModelKey, recent);
}
