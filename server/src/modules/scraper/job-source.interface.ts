import type {
  PortalJobCard,
  PortalJobDetail,
  SearchArgs,
} from './portal-cli.service.js';
import type { PortalEntry } from './portal-registry.js';

export const JOB_SOURCE = Symbol('JOB_SOURCE');

/**
 * SEAM 5 — nơi tin tuyển dụng đến từ.
 *
 * `ScraperService` KHÔNG được biết một nguồn là CLI hay là HTTP: nó chỉ hỏi "có
 * nguồn này không", "tìm đi", "lấy mô tả đi". Nhờ vậy thêm một nguồn không phải sửa
 * dòng nào trong luồng quét, chấm điểm, hay fan-out.
 *
 * Hai adapter, và chúng khác nhau ở gần như mọi thứ ngoài hình dạng dữ liệu:
 *
 * - `PortalCliService` — chạy CLI của skill trong `.agents/skills/`, phải giữ nhịp
 *   chống chặn IP, và bốn portal Việt đều nằm ở đây.
 * - `AtsSourceService` — gọi **API job board công khai** của Greenhouse/Lever/Ashby.
 *   Không CLI, không cần nhịp lịch sự (đây là API họ công bố để dùng), và quan trọng
 *   nhất: **form ứng tuyển của chúng công khai**, nên Assisted Apply chạy thật được.
 *   Bốn portal Việt thì luôn trả `LOGIN_WALL`.
 *
 * Đây cũng là cách trả món nợ ToS đã ghi ở `LO-TRINH.md` mục 4: nguồn hợp lệ, có tài
 * liệu, không scrape.
 */
export interface JobSource {
  /// Quét lại danh sách nguồn. Gọi được lúc chạy để nhận nguồn mới.
  reload(): Promise<PortalEntry[]>;
  listPortals(): string[];
  describePortals(): PortalEntry[];
  has(portal: string): boolean;
  search(portal: string, args: SearchArgs): Promise<PortalJobCard[]>;
  detail(portal: string, slug: string): Promise<PortalJobDetail>;
}
