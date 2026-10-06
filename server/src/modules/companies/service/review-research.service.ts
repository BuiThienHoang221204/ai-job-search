import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pageToText } from '@/common/web/html-text';
import { fetchPage } from '@/common/web/http-get';
import { parseSerper } from '@/common/web/serper';
import { webLimitsFrom, type WebLimits } from '@/common/web/web-limits';
import type { SearchHit } from '../utils/review-sources';
import { messageOf } from '@/common/error-message';

@Injectable()
export class ReviewResearchService {
  private readonly logger = new Logger(ReviewResearchService.name);

  private readonly web: WebLimits;

  constructor(config: ConfigService) {
    this.web = webLimitsFrom(config);
  }

  get enabled(): boolean {
    return this.web.search.apiKey !== '';
  }

  async search(query: string): Promise<SearchHit[]> {
    try {
      const response = await fetch(this.web.search.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.web.search.apiKey,
        },
        body: JSON.stringify({
          q: query,
          num: this.web.search.maxResults,
          gl: 'vn',
          hl: 'vi',
        }),
        signal: AbortSignal.timeout(this.web.fetchTimeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`Tìm kiếm trả về HTTP ${response.status}: ${query}`);
        return [];
      }

      return parseSerper(await response.json());
    } catch (error) {
      this.logger.warn(`Tìm kiếm hỏng (${query}): ${messageOf(error)}`);
      return [];
    }
  }

  async readPage(url: string): Promise<string | null> {
    try {
      const page = await fetchPage(url, {
        timeoutMs: this.web.fetchTimeoutMs,
        maxBytes: this.web.fetchMaxBytes,
      });

      if (page.status < 200 || page.status >= 300) return null;
      const text = pageToText(page.body);
      return text.length < 400 ? null : text;
    } catch (error) {
      this.logger.warn(`Không đọc được ${url}: ${messageOf(error)}`);
      return null;
    }
  }
}
