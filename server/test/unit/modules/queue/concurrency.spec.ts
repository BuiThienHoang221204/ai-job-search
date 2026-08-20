import { QUEUE, concurrencyFor } from 'src/modules/queue/queue.service.js';

describe('concurrencyFor', () => {
  /// Đây là test giữ cho một ràng buộc ĐÚNG ĐẮN không bị biến thành núm chỉnh.
  /// `PortalCliService.pace()` đọc mốc thời gian rồi mới ghi sau một `await`,
  /// nên hai lượt quét song song cùng bỏ qua nhịp chống chặn IP. Ai nâng
  /// QUEUE_CONCURRENCY lên cũng KHÔNG được kéo theo hàng đợi quét.
  test('hàng đợi quét luôn tuần tự dù cấu hình cao', () => {
    expect(concurrencyFor(QUEUE.SCRAPE_RUN, 1)).toBe(1);
    expect(concurrencyFor(QUEUE.SCRAPE_RUN, 25)).toBe(1);
  });

  test('hàng đợi AI nhận đúng mức cấu hình', () => {
    expect(concurrencyFor(QUEUE.EVALUATE_MATCH, 10)).toBe(10);
    expect(concurrencyFor(QUEUE.GENERATE_DOCUMENT, 4)).toBe(4);
    expect(concurrencyFor(QUEUE.UPSKILL_REPORT, 25)).toBe(25);
  });

  /// Cấu hình rác không được biến thành 0 worker: hàng đợi im lặng không chạy
  /// gì trông y hệt hàng đợi hỏng, mà không có log nào nói tại sao.
  test('giá trị vô lý lùi về 1 chứ không về 0', () => {
    expect(concurrencyFor(QUEUE.EVALUATE_MATCH, 0)).toBe(1);
    expect(concurrencyFor(QUEUE.EVALUATE_MATCH, -5)).toBe(1);
    expect(concurrencyFor(QUEUE.EVALUATE_MATCH, NaN)).toBe(1);
    expect(concurrencyFor(QUEUE.EVALUATE_MATCH, 2.7)).toBe(2);
  });
});
