import crypto from 'node:crypto';

const BASE62_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;

let lastTimestamp = 0;
let counter = 0;
const sessions = new Map<string, string>();

function unstableRandom(): string {
  const bytes = crypto.randomBytes(14);
  let randomPart = '';
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

function generateSessionId(): string {
  const now = Date.now();
  if (now !== lastTimestamp) {
    lastTimestamp = now;
    counter = 0;
  }
  counter++;
  const timeHex = (
    ~(BigInt(now) * 0x1000n + BigInt(counter)) & SESSION_PREFIX_MASK
  )
    .toString(16)
    .padStart(12, '0');
  return `ses_${timeHex}${unstableRandom()}`;
}

/** Quản lý và tái sử dụng session ID theo model hoặc key định danh. */
export function getOrCreateSessionId(key: string): string {
  let id = sessions.get(key);
  if (!id) {
    id = generateSessionId();
    sessions.set(key, id);
  }
  return id;
}
