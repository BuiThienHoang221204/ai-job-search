/**
 * Nghỉ giữa các request tới portal. robots.txt cho phép, nhưng không có nghĩa
 * là nên bắn liên tục.
 *
 * Mọi đường chạm tới portal đều phải đi qua đây - cả tìm kiếm lẫn lấy chi tiết
 * - nếu không thì nhịp lịch sự chỉ đúng ở một nửa số request.
 */
export const POLITE_DELAY_MS = 1_200;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
