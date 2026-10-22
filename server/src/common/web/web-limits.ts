import type { ConfigService } from '@nestjs/config';

type SearchProvider = { apiKey: string; url: string };

export type WebLimits = {
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  search: {
    maxResults: number;
    tavily: SearchProvider;
    serper: SearchProvider;
  };
};

export const webLimitsFrom = (config: ConfigService): WebLimits =>
  config.get<WebLimits>('web')!;
