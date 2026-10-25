import { DAY_MS, HOUR_MS } from '@/common/duration';

const VN_OFFSET_MS = 7 * HOUR_MS;

/** 00:00 giờ Việt Nam của ngày chứa `now`. */
export function vnDayStart(now: Date): Date {
  const local = now.getTime() + VN_OFFSET_MS;
  const midnight = local - (local % DAY_MS);
  return new Date(midnight - VN_OFFSET_MS);
}

export const jobAlertUrl = (since: Date) =>
  `/dashboard/jobs?scored=1&since=${encodeURIComponent(since.toISOString())}`;

export function jobAlertBody(
  total: number,
  newest: { title: string; company: string }[],
): string {
  const named = newest.map((job) => `${job.title} · ${job.company}`).join(', ');
  const rest = total - newest.length;
  if (rest <= 0) return `${total} tin mới hợp với bạn: ${named}.`;
  return `${total} tin mới hợp với bạn: ${named} và ${rest} tin khác.`;
}
