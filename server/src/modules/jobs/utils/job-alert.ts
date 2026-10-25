import { DAY_MS, HOUR_MS } from '@/common/duration';

const VN_OFFSET_MS = 7 * HOUR_MS;
const SHOWN_COMPANIES = 2;

/** 00:00 giờ Việt Nam của ngày chứa `now`. */
export function vnDayStart(now: Date): Date {
  const local = now.getTime() + VN_OFFSET_MS;
  const midnight = local - (local % DAY_MS);
  return new Date(midnight - VN_OFFSET_MS);
}

export const jobAlertUrl = (list: 'scored' | 'followed', since: Date) =>
  `/dashboard/jobs?${list}=1&since=${encodeURIComponent(since.toISOString())}`;

export function jobAlertBody(
  total: number,
  newest: { title: string; company: string }[],
): string {
  const named = newest.map((job) => `${job.title} · ${job.company}`).join(', ');
  const rest = total - newest.length;
  if (rest <= 0) return `${total} tin mới hợp với bạn: ${named}.`;
  return `${total} tin mới hợp với bạn: ${named} và ${rest} tin khác.`;
}

export function followedAlertText(
  companies: { name: string; count: number }[],
): string {
  const total = companies.reduce((sum, company) => sum + company.count, 0);
  const named = companies
    .slice(0, SHOWN_COMPANIES)
    .map((company) => company.name)
    .join(', ');
  const rest = companies.length - SHOWN_COMPANIES;
  if (rest <= 0) return `Công ty bạn theo dõi: ${total} tin mới từ ${named}.`;
  return `Công ty bạn theo dõi: ${total} tin mới từ ${named} và ${rest} công ty khác.`;
}
