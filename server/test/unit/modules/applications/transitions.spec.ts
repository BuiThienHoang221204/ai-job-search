import {
  FINAL_STATUSES,
  OPEN_STATUSES,
  isFinal,
  timestampsFor,
} from 'src/modules/applications/transitions.js';

describe('isFinal', () => {
  test('hai trạng thái mở không phải trạng thái cuối', () => {
    for (const status of OPEN_STATUSES) expect(isFinal(status)).toBe(false);
  });

  test('trạng thái đã huỷ là trạng thái cuối', () => {
    for (const status of FINAL_STATUSES) expect(isFinal(status)).toBe(true);
  });

  test('hai danh sách không chồng nhau và phủ hết enum', () => {
    const all = [...OPEN_STATUSES, ...FINAL_STATUSES];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(3);
  });
});

describe('timestampsFor', () => {
  const now = new Date('2026-08-09T10:00:00Z');
  const earlier = new Date('2026-08-01T10:00:00Z');

  test('đặt appliedAt ở lần chuyển sang APPLIED đầu tiên', () => {
    const result = timestampsFor(
      'APPLIED',
      { appliedAt: null, closedAt: null },
      now,
    );
    expect(result.appliedAt).toBe(now);
  });

  test('KHÔNG ghi đè appliedAt đã có', () => {
    // Ngày nộp gốc là mốc đếm "im lặng bao nhiêu ngày"; ghi đè là mất mốc đó.
    const result = timestampsFor(
      'APPLIED',
      { appliedAt: earlier, closedAt: null },
      now,
    );
    expect(result.appliedAt).toBe(earlier);
  });

  test('đặt closedAt khi chuyển sang trạng thái cuối', () => {
    for (const status of FINAL_STATUSES) {
      expect(
        timestampsFor(status, { appliedAt: earlier, closedAt: null }, now)
          .closedAt,
      ).toBe(now);
    }
  });

  test('xóa closedAt khi mở lại đơn', () => {
    const result = timestampsFor(
      'APPLIED',
      { appliedAt: earlier, closedAt: earlier },
      now,
    );
    expect(result.closedAt).toBeNull();
    expect(result.appliedAt).toBe(earlier);
  });
});
