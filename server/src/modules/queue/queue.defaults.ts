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

export function concurrencyForQueue(queue: string): number {
  const config = DEFAULTS[queue];
  if (!config || config.serial) return 1;
  return config.concurrency;
}

export function allQueueConfigs(): Record<string, QueueConfig> {
  return { ...DEFAULTS };
}
