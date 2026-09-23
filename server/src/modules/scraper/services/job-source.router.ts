import { Injectable, Logger } from '@nestjs/common';
import { PortalCliService } from './portal-cli.service.js';
import type {
  JobSource,
  PortalEntry,
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from '../types.js';

/** Lấy tin Ở ĐÂU: chọn adapter theo khoá portal. Đây là toàn bộ nội dung của SEAM 5 nhìn từ phía người gọi. */
@Injectable()
export class JobSourceRouter implements JobSource {
  private readonly logger = new Logger(JobSourceRouter.name);

  constructor(private readonly cli: PortalCliService) {}

  /** Chỗ cắm nguồn mới: thêm adapter vào đây, `ScraperService` không phải biết. */
  private get adapters(): JobSource[] {
    return [this.cli];
  }

  /** Quét lại MỌI adapter rồi gộp; khoá trùng chỉ cảnh báo chứ không ném, vì mất cả lượt reload là mất luôn portal đang chạy tốt. */
  async reload(): Promise<PortalEntry[]> {
    const lists = await Promise.all(
      this.adapters.map((adapter) => adapter.reload()),
    );
    const entries = lists.flat();

    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.key)) {
        this.logger.warn(
          `Khoá nguồn "${entry.key}" khai hai lần; mục đứng trước sẽ thắng.`,
        );
      }
      seen.add(entry.key);
    }

    return entries;
  }

  /** Chỉ khoá portal, dùng để chọn nguồn khi người dùng không nêu tên. */
  listPortals(): string[] {
    return this.adapters.flatMap((adapter) => adapter.listPortals());
  }

  /** Kèm mô tả và cờ `supportsJobAge` — giao diện dựng menu chọn từ đây. */
  describePortals(): PortalEntry[] {
    return this.adapters.flatMap((adapter) => adapter.describePortals());
  }

  /** Có adapter nào nhận khoá này không. Controller hỏi trước khi tạo `ScrapeRun`. */
  has(portal: string): boolean {
    return this.adapters.some((adapter) => adapter.has(portal));
  }

  /** Chuyển tiếp sang adapter giữ khoá đó; nhịp chống chặn IP do adapter tự lo. */
  search(portal: string, args: SearchArgs): Promise<PortalJobCard[]> {
    return this.pick(portal).search(portal, args);
  }

  /** Chuyển tiếp sang adapter giữ khoá đó. Đây là lời gọi ĐẮT nhất của một lượt quét. */
  detail(portal: string, slug: string): Promise<PortalJobDetail> {
    return this.pick(portal).detail(portal, slug);
  }

  /** Khoá lạ thì ném NGAY: im lặng trả mảng rỗng sẽ được ghi là "thành công, 0 tin". */
  private pick(portal: string): JobSource {
    const adapter = this.adapters.find((item) => item.has(portal));
    if (!adapter) {
      throw new Error(
        `Nguồn chưa được đăng ký: ${portal}. Đang có: ${this.listPortals().join(', ') || 'không có nguồn nào'}`,
      );
    }
    return adapter;
  }
}
