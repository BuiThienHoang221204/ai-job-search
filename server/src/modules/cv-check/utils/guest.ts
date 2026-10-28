import { createHmac } from 'node:crypto';
import { HOUR_MS } from '@/common/duration';

const VIETNAM_OFFSET_MS = 7 * HOUR_MS;

export const vnDay = (now: number): string =>
  new Date(now + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);

export const guestKeyOf = (ip: string, secret: string): string =>
  createHmac('sha256', secret).update(ip).digest('hex');
