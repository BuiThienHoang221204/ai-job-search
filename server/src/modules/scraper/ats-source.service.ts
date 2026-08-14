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

/// Một board trả cả trăm tin (đo được: Lever demo 388, Ashby 59). Cắt để một lượt
/// quét không nhồi cả nghìn bản ghi rồi xếp cả nghìn lượt chấm điểm.
const MAX_JOBS_PER_BOARD = 60;

/// API công khai nên không cần nhịp lịch sự như CLI scraper, nhưng vẫn phải có hạn:
/// một board treo không được giữ cả lượt quét.
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Nguồn tin từ **API job board công khai** của Greenhouse / Lever / Ashby.
 *
 * Vì sao nguồn này tồn tại, và lý do không phải là "có thêm tin": **form ứng tuyển
 * của chúng công khai**. Bốn portal Việt đang thu tin đều đặt form sau tường đăng
 * nhập, nên Assisted Apply với chúng chỉ trả về `LOGIN_WALL` — đúng nhưng không demo
 * được luồng "mở link → điền → upload file" mà đề tài yêu cầu. Với ba hệ này thì luồng
 * đó chạy thật (đã đo: điền 7 trường, 8,1 giây).
 *
 * Nó cũng là món trả nợ ToS ghi ở `LO-TRINH.md` mục 4: đây là API họ công bố, đọc nó
 * không phải scrape.
 *
 * Board nào được đọc do cấu hình `ATS_BOARDS` quyết định, không cắm cứng trong code:
 * danh sách công ty là quyết định nghiệp vụ, và nó đổi mà không cần build lại.
 */
@Injectable()
export class AtsSourceService implements JobSource {
  private readonly logger = new Logger(AtsSourceService.name);
  private boards = new Map<string, AtsBoard>();

  constructor(private readonly config: ConfigService) {
    this.load();
  }

  /**
   * Khoá portal là `vendor-company`, ví dụ `greenhouse-acme`.
   *
   * Có tiền tố vendor vì hai công ty khác nhau có thể trùng slug trên hai hệ ATS, và
   * `ScrapeRun.portal` là một chuỗi duy nhất — trùng khoá thì hai board ghi lẫn vào
   * nhau mà không ai thấy.
   */
  private load(): void {
    const raw = this.config.get<string>('scraper.atsBoards');
    const parsed = parseBoards(raw);

    this.boards = new Map(
      parsed.map((board) => [`${board.vendor}-${board.company}`, board]),
    );

    if (raw && parsed.length === 0) {
      // Cấu hình có mà không parse được board nào: nói ra, đừng im lặng chạy với 0
      // nguồn rồi để người vận hành tự đoán vì sao không có tin nào.
      this.logger.warn(
        `ATS_BOARDS có giá trị nhưng không đọc được board nào: "${raw}". Định dạng đúng: greenhouse:acme,lever:beta`,
      );
    } else if (parsed.length > 0) {
      this.logger.log(`Nguồn ATS: ${[...this.boards.keys()].join(', ')}`);
    }
  }

  /// Đọc lại cấu hình. Cùng chữ ký với `PortalCliService.reload` để hai adapter thay
  /// nhau được, dù ở đây không có thư mục nào để quét.
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
      // Không có CLI: đây là nguồn HTTP. Để rỗng thay vì bịa một đường dẫn.
      cliPath: '',
      enabled: true,
      description: `API job board công khai của ${board.vendor} (công ty ${board.company}) — form ứng tuyển công khai nên Assisted Apply chạy thật được`,
    }));
  }

  has(portal: string): boolean {
    return this.boards.has(portal);
  }

  /**
   * Lấy toàn bộ tin của board rồi **lọc bằng từ khoá tại chỗ**.
   *
   * Ba API này không có tham số tìm kiếm — chúng trả cả bảng tin. Lọc ở đây thay vì
   * lưu hết: `ScraperService` truyền vào truy vấn suy từ hồ sơ người dùng, và tôn
   * trọng nó giữ cho lượt quét không nhồi 388 tin không liên quan vào database.
   *
   * Không có từ khoá thì trả tất cả (đã cắt trần) — đúng với lượt quét của hệ thống.
   */
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

  /**
   * KHÔNG BAO GIỜ được gọi tới, và đó là chủ đích.
   *
   * Cả ba API đều trả mô tả đầy đủ ngay trong danh sách (đã đo: Greenhouse 9.481 ký
   * tự, Ashby 16.256), nên `ScraperService` thấy `card.description` đã có và bỏ hẳn
   * request chi tiết. Ném lỗi rõ ràng ở đây tốt hơn là gọi lại API rồi lọc tìm một
   * tin — nếu một ngày nào đó nó được gọi, đó là dấu hiệu luồng quét đã đổi.
   */
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
      // 404 ở đây gần như luôn là slug công ty sai, nên nói ra slug thay vì chỉ mã lỗi.
      throw new Error(
        `Board ${board.vendor}:${board.company} trả HTTP ${response.status}. ` +
          `Kiểm tra lại slug công ty trong ATS_BOARDS.`,
      );
    }

    return response.json();
  }
}

/**
 * Lọc theo từ khoá: khớp trên tiêu đề, tag, và mô tả.
 *
 * Hàm thuần và tách rời để test được. Tách từ khoá theo khoảng trắng rồi đòi **mọi**
 * từ đều xuất hiện: một truy vấn "senior devops" không nên trả về mọi tin có chữ
 * "senior". Đây là bộ lọc thô, và nó chỉ cần thô — điểm phù hợp thật do model chấm ở
 * bước sau.
 */
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
