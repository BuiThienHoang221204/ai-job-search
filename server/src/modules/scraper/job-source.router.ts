import { Injectable, Logger } from '@nestjs/common';
import { AtsSourceService } from './services/ats-source.service.js';
import {
  PortalCliService,
  type PortalJobCard,
  type PortalJobDetail,
  type SearchArgs,
} from './services/portal-cli.service.js';
import type { PortalEntry } from './portal-registry.js';
import type { JobSource } from './job-source.interface.js';

/** Chọn adapter theo khoá nguồn. Đây là toàn bộ nội dung của SEAM 5 ở phía người gọi. */
@Injectable()
export class JobSourceRouter implements JobSource {
  private readonly logger = new Logger(JobSourceRouter.name);

  constructor(
    private readonly cli: PortalCliService,
    private readonly ats: AtsSourceService,
  ) {}

  private get adapters(): JobSource[] {
    return [this.cli, this.ats];
  }

  async reload(): Promise<PortalEntry[]> {
    const lists = await Promise.all(
      this.adapters.map((adapter) => adapter.reload()),
    );
    const entries = lists.flat();

    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.key)) {
        this.logger.warn(
          `Khoá nguồn "${entry.key}" khai ở hai adapter; adapter đứng trước sẽ thắng.`,
        );
      }
      seen.add(entry.key);
    }

    return entries;
  }

  listPortals(): string[] {
    return this.adapters.flatMap((adapter) => adapter.listPortals());
  }

  describePortals(): PortalEntry[] {
    return this.adapters.flatMap((adapter) => adapter.describePortals());
  }

  has(portal: string): boolean {
    return this.adapters.some((adapter) => adapter.has(portal));
  }

  search(portal: string, args: SearchArgs): Promise<PortalJobCard[]> {
    return this.pick(portal).search(portal, args);
  }

  detail(portal: string, slug: string): Promise<PortalJobDetail> {
    return this.pick(portal).detail(portal, slug);
  }

  /**
   * Không có adapter nào nhận thì ném NGAY với danh sách đang có: một lượt quét vào
   * khoá lạ mà im lặng trả mảng rỗng sẽ được ghi là "thành công, 0 tin".
   */
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
