/** Thứ tự phải giữ: timeout 1 lời gọi < AI_CHAIN_BUDGET_MS 4' < server.setTimeout 5' < STUCK_AFTER_MS 10'. */

/** Sau bao lâu thì một hàng còn RUNNING được coi là bị bỏ rơi. */
export const STALE_RUNNING_MS = 5 * 60_000;

/** Sau bao lâu thì một việc nền được coi là đã rơi hẳn. */
export const STUCK_AFTER_MS = Math.max(STALE_RUNNING_MS, 10 * 60_000);
