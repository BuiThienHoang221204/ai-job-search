import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseSerper } from '../../agent/tools/web-search.tool.js';
import { pageToText } from '../../agent/utils/html-text.js';
import { fetchPage } from '../../agent/utils/http-get.js';
import type { SearchHit } from './review-sources.js';

/**
 * Cửa duy nhất ra mạng của luồng tìm hiểu công ty. Tách khỏi `CompanyService`
 * để phần điều phối test được mà không cần mạng.
 */
@Injectable()
export class ReviewResearchService {
  private readonly logger = new Logger(ReviewResearchService.name);

  constructor(private readonly config: ConfigService) {}

  private limit<T>(key: string): T {
    return this.config.get<T>(`agent.${key}`)!;
  }

  get enabled(): boolean {
    return this.limit<string>('searchApiKey') !== '';
  }

  /** Hỏng thì trả mảng rỗng: thiếu một câu truy vấn không đáng làm hỏng cả lượt. */
  async search(query: string): Promise<SearchHit[]> {
    try {
      const response = await fetch(this.limit<string>('searchUrl'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.limit<string>('searchApiKey'),
        },
        body: JSON.stringify({
          q: query,
          num: this.limit<number>('searchMaxResults'),
          gl: 'vn',
          hl: 'vi',
        }),
        signal: AbortSignal.timeout(this.limit<number>('fetchTimeoutMs')),
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
        timeoutMs: this.limit<number>('fetchTimeoutMs'),
        maxBytes: this.limit<number>('fetchMaxBytes'),
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
