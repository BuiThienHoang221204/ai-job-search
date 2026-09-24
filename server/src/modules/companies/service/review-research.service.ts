import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pageToText } from '../../../common/web/html-text.js';
import { fetchPage } from '../../../common/web/http-get.js';
import { parseSerper } from '../../../common/web/serper.js';
import {
  webLimitsFrom,
  type WebLimits,
} from '../../../common/web/web-limits.js';
import type { SearchHit } from '../utils/review-sources.js';

/** Cửa duy nhất ra mạng, tách khỏi `CompanyService` để test không cần mạng. */
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

  /** Hỏng thì trả mảng rỗng: thiếu một câu truy vấn không đáng làm hỏng cả lượt. */
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
      this.logger.warn(
        `Tìm kiếm hỏng (${query}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /** Chữ của một trang, hoặc `null` khi tải hỏng hay trang không có nội dung. */
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
      this.logger.warn(
        `Không đọc được ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
