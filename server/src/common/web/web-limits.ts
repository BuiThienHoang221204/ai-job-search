import type { ConfigService } from '@nestjs/config';

/**
 * Trần cho mọi lượt ra mạng của máy chủ.
 *
 * Tách khỏi `AgentLimits` vì hai thứ này thuộc hai chủ đề khác nhau và có hai
 * người dùng khác nhau: agent đọc trần BƯỚC, còn luồng tìm hiểu công ty chỉ cần
 * trần MẠNG. Trước đây `companies` phải đọc config dưới namespace `agent.*` cho
 * một việc chẳng dính gì tới agent, nên chỉnh `AGENT_FETCH_TIMEOUT_MS` để chữa
 * một lượt chạy agent là lặng lẽ đổi cả luồng tìm hiểu công ty.
 */
export type WebLimits = {
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  search: { apiKey: string; url: string; maxResults: number };
};

export const webLimitsFrom = (config: ConfigService): WebLimits =>
  config.get<WebLimits>('web')!;
