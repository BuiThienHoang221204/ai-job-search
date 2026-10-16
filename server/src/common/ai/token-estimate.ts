const CHARS_PER_TOKEN = 3.5;

const SCHEMA_OVERHEAD_TOKENS = 1200;

/** Ước CAO hơn số token Groq đếm (đo 2026-10-07: tiếng Việt 3,67 ký tự/token, tiếng Anh 4,3, JSON Schema bơm vào prompt ~1.080 token). */
export function estimateTokens(system: string, prompt: string): number {
  return (
    Math.ceil((system.length + prompt.length) / CHARS_PER_TOKEN) +
    SCHEMA_OVERHEAD_TOKENS
  );
}
