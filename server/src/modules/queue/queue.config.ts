/**
 * Cấu hình concurrency cho từng hàng đợi.
 *
 * Mô hình phân phối thực tế cho 1k user:
 * - Giờ cao điểm: 50-100 task đồng thời
 * - Giờ bình thường: 10-30
 * - Đêm: 1-5
 *
 * Tổng concurrency không nên vượt quá số lượng AI provider rate limit.
 * Ví dụ: OpenCode free tier ~60 RPM → tổng concurrency tối đa ~20-30.
 */

export type QueueConfig = {
  /** Số worker song song cho hàng đợi này. */
  concurrency: number;
  /** Có bắt buộc tuần tự không (ghi đè concurrency thành 1). */
  serial?: boolean;
};

/**
 *酩-default concurrency cho mỗi hàng đợi.
 * Đọc từ env `{QUEUE_NAME}_CONCURRENCY` nếu có, nếu không dùng giá trị mặc định.
 */
const DEFAULTS: Record<string, QueueConfig> = {
  // --- AI-heavy queues: mỗi job gọi 1-2 lần LLM ---
  'match.evaluate': { concurrency: 10 },
  'interview.prep': { concurrency: 5 },
  'upskill.report': { concurrency: 5 },
  'document.generate': { concurrency: 8 },
  'agent.run': { concurrency: 5 },
  'company.brief': { concurrency: 3 },
  'job.requirements': { concurrency: 5 },
  'profile.synthesize': { concurrency: 3 },

  // --- CPU-only / lightweight ---
  'match.requirements': { concurrency: 15 },
  'skill.canonicalize': { concurrency: 10 },

  // --- Serial: phải tuần tự để tránh bị chặn IP ---
  'scrape.run': { concurrency: 1, serial: true },
};

/** Env override pattern: MATCH_CONCURRENCY=20, AGENT_CONCURRENCY=10, ... */
function envKeyFor(queueName: string): string {
  return `${queueName.replace(/\./g, '_').toUpperCase()}_CONCURRENCY`;
}

export function concurrencyForQueue(queue: string): number {
  const config = DEFAULTS[queue];
  if (!config) return 1;
  if (config.serial) return 1;

  const envKey = envKeyFor(queue);
  const envVal = process.env[envKey];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (parsed > 0) return parsed;
  }

  return config.concurrency;
}

export function allQueueConfigs(): Record<string, QueueConfig> {
  return { ...DEFAULTS };
}
