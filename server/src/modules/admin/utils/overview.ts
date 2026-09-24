/** Ngưỡng của khối "Cần xử lý"; đổi ở đây là đổi cho cả giao diện. */
export const OVERVIEW_THRESHOLDS = {
  /** Tỷ lệ thành công AI dưới mức này là sự cố. */
  minSuccessRate: 80,
  /** Dưới số lời gọi này thì tỷ lệ chưa đủ ý nghĩa để báo động. */
  minCallsForRate: 20,
  /** Tổng việc đang chờ vượt mức này là hàng đợi đang ứ. */
  maxQueueWaiting: 50,
  /** Cron quét chạy 23h mỗi đêm; quá mức này không có lượt nào là cron đã lỡ nhịp hoặc đang tắt. */
  scrapeStaleHours: 26,
} as const;

export type Severity = 'danger' | 'warning';

export interface AttentionItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  action: string;
}

/** Tỷ lệ phần trăm làm tròn 1 chữ số, null khi chưa có lời gọi nào. */
export const rate = (ok: number, total: number): number | null =>
  total === 0 ? null : Math.round((ok / total) * 1000) / 10;

/** Tỷ lệ đủ mẫu để so sánh; kỳ chỉ có vài lời gọi thì "0%" là nhiễu, không phải mốc. */
export const comparableRate = (ok: number, total: number): number | null =>
  total < OVERVIEW_THRESHOLDS.minCallsForRate ? null : rate(ok, total);

/** Loại lỗi xuất hiện nhiều nhất, null khi không có lần hỏng nào. */
export function topFailureKind(
  kinds: Array<{ kind: string | null; count: number }>,
): { kind: string; count: number } | null {
  const top = [...kinds].sort((a, b) => b.count - a.count)[0];
  return top ? { kind: top.kind ?? 'OTHER', count: top.count } : null;
}

/** Cửa sổ ngay trước, cùng độ dài, kết thúc đúng lúc cửa sổ hiện tại bắt đầu. */
export const previousSince = (since: Date, now = new Date()): Date =>
  new Date(since.getTime() - (now.getTime() - since.getTime()));

export interface AttentionInput {
  calls: number;
  ok: number;
  previousSuccessRate: number | null;
  /** Loại lỗi nhiều nhất cộng trên MỌI tác vụ, để nói nguyên nhân ngay trong câu báo. */
  topFailure: { kind: string; count: number } | null;
  failed: number;
  queueWaiting: number;
  portals: Array<{ portal: string; status: string; error: string | null }>;
  lastScrapeAt: Date | null;
  now?: Date;
}

/** Luật sinh các mục "Cần xử lý", nặng trước nhẹ sau. */
export function buildAttention(input: AttentionInput): AttentionItem[] {
  const t = OVERVIEW_THRESHOLDS;
  const items: AttentionItem[] = [];
  const success = rate(input.ok, input.calls);

  if (
    success !== null &&
    input.calls >= t.minCallsForRate &&
    success < t.minSuccessRate
  ) {
    const was =
      input.previousSuccessRate === null
        ? ''
        : ` (kỳ trước ${input.previousSuccessRate}%)`;
    const cause =
      input.topFailure && input.failed > 0
        ? ` ${input.topFailure.kind} chiếm ${Math.round((input.topFailure.count / input.failed) * 100)}% số lần hỏng.`
        : '';
    items.push({
      id: 'ai-success',
      severity: 'danger',
      title: `AI chỉ thành công ${success}%${was}`,
      detail: `${input.calls - input.ok}/${input.calls} lời gọi không cho ra kết quả dùng được.${cause}`,
      href: '/ai-failures',
      action: 'Xem lỗi',
    });
  }

  if (input.queueWaiting > t.maxQueueWaiting) {
    items.push({
      id: 'queue-backlog',
      severity: 'warning',
      title: `${input.queueWaiting} việc đang chờ trong hàng đợi`,
      detail: `Vượt ngưỡng ${t.maxQueueWaiting}. Worker không theo kịp lượng việc đổ vào.`,
      href: '/queues',
      action: 'Mở hàng đợi',
    });
  }

  for (const run of input.portals) {
    if (run.status !== 'FAILED') continue;
    items.push({
      id: `scrape-${run.portal}`,
      severity: 'warning',
      title: `Lượt quét gần nhất của ${run.portal} bị hỏng`,
      detail: run.error ?? 'Không có thông báo lỗi.',
      href: '/scrape',
      action: 'Xem lượt quét',
    });
  }

  const now = input.now ?? new Date();
  const staleMs = t.scrapeStaleHours * 60 * 60 * 1000;
  if (
    !input.lastScrapeAt ||
    now.getTime() - input.lastScrapeAt.getTime() > staleMs
  ) {
    items.push({
      id: 'scrape-stale',
      severity: 'warning',
      title: input.lastScrapeAt
        ? `Hơn ${t.scrapeStaleHours} giờ chưa có lượt quét nào`
        : 'Chưa từng có lượt quét nào',
      detail:
        'Cron 23h có thể đã lỡ nhịp hoặc đang tắt (SCRAPE_CRON_ENABLED=false).',
      href: '/scrape',
      action: 'Quét ngay',
    });
  }

  return items.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1,
  );
}

/** Điều kiện "lời gọi hỏng trong khoảng [from, to)" dùng chung cho nhật ký lỗi và bộ lọc của nó. */
export function failureWindow(range: { from?: string; to?: string }) {
  return {
    ok: false,
    ...(range.from || range.to
      ? {
          createdAt: {
            ...(range.from ? { gte: new Date(range.from) } : {}),
            ...(range.to ? { lt: new Date(range.to) } : {}),
          },
        }
      : {}),
  };
}
