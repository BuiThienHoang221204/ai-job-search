import type { ConfigService } from '@nestjs/config';

export type WebLimits = {
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  search: { apiKey: string; url: string; maxResults: number };
};

export const webLimitsFrom = (config: ConfigService): WebLimits =>
  config.get<WebLimits>('web')!;
