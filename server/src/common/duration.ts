export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const daysAgo = (days: number, now = Date.now()) =>
  new Date(now - days * DAY_MS);

export const STALE_RUNNING_MS = 5 * 60_000;

export const STUCK_AFTER_MS = Math.max(STALE_RUNNING_MS, 10 * 60_000);
