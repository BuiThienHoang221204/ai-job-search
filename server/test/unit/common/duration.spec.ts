import { DAY_MS, HOUR_MS, MINUTE_MS, daysAgo } from 'src/common/duration.js';

describe('duration', () => {
  test('hằng số đúng giá trị viết tay trước đây', () => {
    expect(MINUTE_MS).toBe(60_000);
    expect(HOUR_MS).toBe(3_600_000);
    expect(DAY_MS).toBe(86_400_000);
  });

  test('daysAgo lùi đúng số ngày tính từ mốc truyền vào', () => {
    const now = Date.UTC(2026, 9, 6, 12);
    expect(daysAgo(2, now)).toEqual(new Date(now - 2 * 86_400_000));
    expect(daysAgo(0, now)).toEqual(new Date(now));
  });
});
