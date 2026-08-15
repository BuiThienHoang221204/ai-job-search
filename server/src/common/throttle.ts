import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Ba mức chặt hơn trần chung, gom một chỗ để các con số có lý do đi kèm thay vì
 * rải rác trong từng controller.
 */

/** Route gọi model. */
export const ThrottleAi = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE } });

/** Đăng nhập và đăng ký. */
export const ThrottleAuth = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE } });

/** Quét portal. */
export const ThrottleScrape = () =>
  Throttle({ default: { limit: 3, ttl: HOUR } });
