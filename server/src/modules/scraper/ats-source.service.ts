import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  boardUrl,
  normalizeAtsJobs,
  parseBoards,
  type AtsBoard,
} from './ats-boards.js';
import type {
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from './portal-cli.service.js';
import type { PortalEntry } from './portal-registry.js';
import type { JobSource } from './job-source.interface.js';

/**
 * Một board trả cả trăm tin (đo được: Lever demo 388, Ashby 59). Cắt để một lượt
 * quét không nhồi cả nghìn bản ghi rồi xếp cả nghìn lượt chấm điểm.
 */
const MAX_JOBS_PER_BOARD = 60;

/**
 * API công khai nên không cần nhịp lịch sự như CLI scraper, nhưng vẫn phải có hạn:
 * một board treo không được giữ cả lượt quét.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/** Nguồn tin từ **API job board công khai** của Greenhouse / Lever / Ashby. */
@Injectable()
export class AtsSourceService implements JobSource {
  private readonly logger = new Logger(AtsSourceService.name);
  private boards = new Map<string, AtsBoard>();

  constructor(private readonly config: ConfigService) {
    this.load();
  }

  /** Khoá portal là `vendor-company`, ví dụ `greenhouse-acme`. */
  private load(): void {
    const raw = this.config.get<string>('scraper.atsBoards');
    const parsed = parseBoards(raw);

    this.boards = new Map(
      parsed.map((board) => [`${board.vendor}-${board.company}`, board]),
    );

    if (raw && parsed.length === 0) {
      this.logger.warn(
        `ATS_BOARDS có giá trị nhưng không đọc được board nào: "${raw}". Định dạng đúng: greenhouse:acme,lever:beta`,
      );
    } else if (parsed.length > 0) {
      this.logger.log(`Nguồn ATS: ${[...this.boards.keys()].join(', ')}`);
    }
  }

  /**
   * Đọc lại cấu hình. Cùng chữ ký với `PortalCliService.reload` để hai adapter thay
   * nhau được, dù ở đây không có thư mục nào để quét.
   */
  reload(): Promise<PortalEntry[]> {
    this.load();
    return Promise.resolve(this.describePortals());
  }

  listPortals(): string[] {
    return [...this.boards.keys()];
  }

  describePortals(): PortalEntry[] {
    return [...this.boards.entries()].map(([key, board]) => ({
      key,
      directory: '',
      cliPath: '',
      enabled: true,
      description: `API job board công khai của ${board.vendor} (công ty ${board.company}) — form ứng tuyển công khai nên Assisted Apply chạy thật được`,
    }));
  }

  has(portal: string): boolean {
    return this.boards.has(portal);
  }

  /** Lấy toàn bộ tin của board rồi **lọc bằng từ khoá tại chỗ**. */
  async search(portal: string, args: SearchArgs): Promise<PortalJobCard[]> {
    const board = this.boards.get(portal);
    if (!board) {
      throw new Error(
        `Nguồn ATS chưa được đăng ký: ${portal}. Đang có: ${this.listPortals().join(', ') || 'không có board nào'}`,
      );
    }

    const payload = await this.fetchBoard(board);
    const cards = normalizeAtsJobs(board, payload);
    const matched = filterByQuery(cards, args.query);

    this.logger.log(
      `${portal}: ${cards.length} tin có mô tả, ${matched.length} khớp "${args.query ?? '(không lọc)'}"`,
    );

    return matched.slice(
      0,
      Math.min(args.limit ?? MAX_JOBS_PER_BOARD, MAX_JOBS_PER_BOARD),
    );
  }

  /** KHÔNG BAO GIỜ được gọi tới, và đó là chủ đích. */
  detail(portal: string, slug: string): Promise<PortalJobDetail> {
    return Promise.reject(
      new Error(
        `Nguồn ATS trả mô tả sẵn trong danh sách nên không có đường lấy chi tiết ` +
          `(${portal}/${slug}). Nếu lỗi này xuất hiện, luồng quét đã thay đổi.`,
      ),
    );
  }

  private async fetchBoard(board: AtsBoard): Promise<unknown> {
    const url = boardUrl(board);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Board ${board.vendor}:${board.company} trả HTTP ${response.status}. ` +
          `Kiểm tra lại slug công ty trong ATS_BOARDS.`,
      );
    }

    return response.json();
  }
}

/** Lọc theo từ khoá: khớp trên tiêu đề, tag, và mô tả. */
export function filterByQuery(
  cards: PortalJobCard[],
  query: string | undefined,
): PortalJobCard[] {
  const terms = (query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);

  if (terms.length === 0) return cards;

  return cards.filter((card) => {
    const haystack = [card.title, ...card.tags, card.description ?? '']
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
