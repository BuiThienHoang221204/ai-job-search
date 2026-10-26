import { Throttle } from '@nestjs/throttler';
import { HOUR_MS, MINUTE_MS } from './duration';

export const ThrottleAi = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE_MS } });

export const ThrottleAuth = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE_MS } });

export const ThrottleScrape = () =>
  Throttle({ default: { limit: 3, ttl: HOUR_MS } });

export const ThrottlePdf = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE_MS } });
