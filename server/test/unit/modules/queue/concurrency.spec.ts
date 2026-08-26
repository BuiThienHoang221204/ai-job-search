import { concurrencyForQueue } from 'src/modules/queue/queue.config.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';

describe('concurrencyForQueue', () => {
  /// Hàng đợi quét LUÔN tuần tự dù config nói gì — vì portal chặn IP nếu song song.
  test('hàng đợi quét luôn tuần tự', () => {
    expect(concurrencyForQueue(QUEUE.SCRAPE_RUN)).toBe(1);
  });

  test('hàng đợi AI trả về concurrency mặc định từ config', () => {
    expect(concurrencyForQueue(QUEUE.EVALUATE_MATCH)).toBe(10);
    expect(concurrencyForQueue(QUEUE.GENERATE_DOCUMENT)).toBe(8);
    expect(concurrencyForQueue(QUEUE.UPSKILL_REPORT)).toBe(5);
  });

  test('hàng đợi không tồn tại trả về 1', () => {
    expect(concurrencyForQueue('queue.khong.ton.tai')).toBe(1);
  });

  test('override bằng env variable', () => {
    const original = process.env.MATCH_EVALUATE_CONCURRENCY;
    process.env.MATCH_EVALUATE_CONCURRENCY = '25';
    expect(concurrencyForQueue(QUEUE.EVALUATE_MATCH)).toBe(25);
    // Restore
    if (original === undefined) {
      delete process.env.MATCH_EVALUATE_CONCURRENCY;
    } else {
      process.env.MATCH_EVALUATE_CONCURRENCY = original;
    }
  });

  test('env无效 giá trị bỏ qua, dùng default', () => {
    const original = process.env.MATCH_EVALUATE_CONCURRENCY;
    process.env.MATCH_EVALUATE_CONCURRENCY = 'abc';
    expect(concurrencyForQueue(QUEUE.EVALUATE_MATCH)).toBe(10);
    if (original === undefined) {
      delete process.env.MATCH_EVALUATE_CONCURRENCY;
    } else {
      process.env.MATCH_EVALUATE_CONCURRENCY = original;
    }
  });
});
