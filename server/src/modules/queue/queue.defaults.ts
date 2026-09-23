export type QueueConfig = {
  /** Số worker song song cho hàng đợi này. */
  concurrency: number;
  /** Bắt buộc tuần tự, ghi đè `concurrency` thành 1. */
  serial?: boolean;
};

/** Bảng MẶC ĐỊNH, chỉ dùng khi database chưa có dòng cấu hình — nguồn sự thật lúc chạy là `QueueConfigService`. */
const DEFAULTS: Record<string, QueueConfig> = {
  // AI-heavy: mỗi job gọi 1-2 lượt model. Tổng concurrency không được vượt rate limit của nhà cung cấp.
  'match.evaluate': { concurrency: 10 },
  'interview.prep': { concurrency: 5 },
  'upskill.report': { concurrency: 5 },
  'document.generate': { concurrency: 8 },
  'agent.run': { concurrency: 5 },
  'company.brief': { concurrency: 3 },
  'job.requirements': { concurrency: 5 },
  'profile.synthesize': { concurrency: 3 },

  // Thuần CPU, không gọi model.
  'match.requirements': { concurrency: 15 },
  'skill.canonicalize': { concurrency: 10 },
  'match.shortlist': { concurrency: 1, serial: true },

  // Tuần tự BẮT BUỘC: chạy song song là tự tăng nhịp chạm portal và bị chặn IP.
  'scrape.run': { concurrency: 1, serial: true },
};

/** Ghi đè bằng env theo mẫu `MATCH_EVALUATE_CONCURRENCY`, `SCRAPE_RUN_CONCURRENCY`… */
function envKeyFor(queueName: string): string {
  return `${queueName.replace(/\./g, '_').toUpperCase()}_CONCURRENCY`;
}

/** Hàng đợi lạ trả về 1: đoán cao hơn là tự ý cho một hàng đợi chưa ai xem xét chạy song song. */
export function concurrencyForQueue(queue: string): number {
  const config = DEFAULTS[queue];
  if (!config) return 1;
  if (config.serial) return 1;

  const raw = process.env[envKeyFor(queue)];
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (parsed > 0) return parsed;
  }
  return config.concurrency;
}

export function allQueueConfigs(): Record<string, QueueConfig> {
  return { ...DEFAULTS };
}
