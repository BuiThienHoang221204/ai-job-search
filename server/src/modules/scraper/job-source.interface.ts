import type {
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from './portal-cli.service.js';
import type { PortalEntry } from './portal-registry.js';

export const JOB_SOURCE = Symbol('JOB_SOURCE');

/** SEAM 5 — nơi tin tuyển dụng đến từ. */
export interface JobSource {
  /** Quét lại danh sách nguồn. Gọi được lúc chạy để nhận nguồn mới. */
  reload(): Promise<PortalEntry[]>;
  listPortals(): string[];
  describePortals(): PortalEntry[];
  has(portal: string): boolean;
  search(portal: string, args: SearchArgs): Promise<PortalJobCard[]>;
  detail(portal: string, slug: string): Promise<PortalJobDetail>;
}
