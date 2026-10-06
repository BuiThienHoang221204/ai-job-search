import { Injectable, Logger } from '@nestjs/common';
import { PortalCliService } from './portal-cli.service';
import type {
  JobSource,
  PortalEntry,
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from '../types';

@Injectable()
export class JobSourceRouter implements JobSource {
  private readonly logger = new Logger(JobSourceRouter.name);

  constructor(private readonly cli: PortalCliService) {}

  private get adapters(): JobSource[] {
    return [this.cli];
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
          `Khoá nguồn "${entry.key}" khai hai lần; mục đứng trước sẽ thắng.`,
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
