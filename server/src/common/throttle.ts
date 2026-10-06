import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const ThrottleAi = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE } });

export const ThrottleAuth = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE } });

export const ThrottleScrape = () =>
  Throttle({ default: { limit: 3, ttl: HOUR } });
