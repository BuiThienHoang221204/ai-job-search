export type QueueConfig = {
  concurrency: number;
  serial?: boolean;
};

const DEFAULTS: Record<string, QueueConfig> = {
  'match.evaluate': { concurrency: 10 },
  'interview.prep': { concurrency: 5 },
  'upskill.report': { concurrency: 5 },
  'document.generate': { concurrency: 8 },
  'company.brief': { concurrency: 3 },
  'job.requirements': { concurrency: 2 },
  'profile.synthesize': { concurrency: 3 },
  'skill.canonicalize': { concurrency: 10 },

  'match.requirements': { concurrency: 15 },
  'match.shortlist': { concurrency: 1, serial: true },

  'scrape.run': { concurrency: 1, serial: true },
};

function envKeyFor(queueName: string): string {
  return `${queueName.replace(/\./g, '_').toUpperCase()}_CONCURRENCY`;
}

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
