import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pageToText } from '@/common/web/html-text';
import { fetchPage } from '@/common/web/http-get';
import { parseSerper } from '@/common/web/serper';
import { parseTavily } from '@/common/web/tavily';
import { webLimitsFrom, type WebLimits } from '@/common/web/web-limits';
import type { SearchHit } from '@/common/web/serper';
import { messageOf } from '@/common/error-message';

@Injectable()
export class ReviewResearchService {
  private readonly logger = new Logger(ReviewResearchService.name);

  private readonly web: WebLimits;

  constructor(config: ConfigService) {
    this.web = webLimitsFrom(config);
  }

  get enabled(): boolean {
    const { tavily, serper } = this.web.search;
    return tavily.apiKey !== '' || serper.apiKey !== '';
  }

  async search(query: string): Promise<SearchHit[]> {
    const { tavily, serper, maxResults } = this.web.search;

    if (tavily.apiKey !== '') {
      const body = await this.post(
        tavily.url,
        { Authorization: `Bearer ${tavily.apiKey}` },
        {
          query,
          max_results: maxResults,
          search_depth: 'basic',
          country: 'vietnam',
        },
      );
      if (body !== null) return parseTavily(body);
    }

    if (serper.apiKey === '') return [];
    const body = await this.post(
      serper.url,
      { 'X-API-KEY': serper.apiKey },
      { q: query, num: maxResults, gl: 'vn', hl: 'vi' },
    );
    return body === null ? [] : parseSerper(body);
  }

  private async post(
    url: string,
    headers: Record<string, string>,
    payload: object,
  ): Promise<unknown> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.web.fetchTimeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`Tìm kiếm ${url} trả về HTTP ${response.status}`);
        return null;
      }

      return (await response.json()) as unknown;
    } catch (error) {
      this.logger.warn(`Tìm kiếm ${url} hỏng: ${messageOf(error)}`);
      return null;
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
