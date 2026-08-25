/**
 * Vai trò của TIẾN TRÌNH này. Cùng một binary, deploy nhiều lần với vai khác
 * nhau: nhiều bản `api` để chịu lưu lượng đọc, một bản `worker` chạy việc nền.
 *
 * Có mặt vì cron và worker nằm chung tiến trình với API. Chạy hai bản app mà
 * không tách vai thì cả hai cùng bắn cron lúc 23h - tức là scale app lên chính
 * là cách nhanh nhất để bị portal chặn IP.
 *
 * KHÔNG dùng ConfigService: `QueueService` đọc `process.env` trực tiếp và
 * không có ConfigModule, còn hai cron service thì có. Vai trò phải là MỘT
 * nguồn sự thật cho cả hai phía, nên nó là hàm thuần đọc env.
 */
export type AppRole = 'api' | 'worker' | 'all';

const ROLES: readonly AppRole[] = ['api', 'worker', 'all'];

const DEFAULT_ROLE: AppRole = 'all';

/**
 * Đọc `APP_ROLE`, mặc định `all` để không đổi hành vi của bản đang chạy.
 * Giá trị lạ thì ném lỗi ngay lúc khởi động, vì đoán sai vai là chạy thiếu
 * worker mà không có dấu hiệu nào.
 */
export function appRole(env: NodeJS.ProcessEnv = process.env): AppRole {
  const raw = env.APP_ROLE?.trim();
  if (!raw) return DEFAULT_ROLE;

  const role = raw.toLowerCase() as AppRole;
  if (!ROLES.includes(role)) {
    throw new Error(
      `APP_ROLE không hợp lệ: "${raw}". Chọn một trong: ${ROLES.join(', ')}.`,
    );
  }
  return role;
}

/**
 * Tiến trình này có tiêu thụ việc nền và chạy cron không.
 *
 * Lưu ý khi chạy NHIỀU bản vai `worker`: pg-boss tự chia việc nên phần worker
 * an toàn, nhưng cron thì KHÔNG - phải tắt bằng `SCRAPE_CRON_ENABLED=false` và
 * `RECONCILE_CRON_ENABLED=false` ở tất cả trừ đúng một bản.
 */
export function runsBackgroundWork(role: AppRole = appRole()): boolean {
  return role !== 'api';
}
