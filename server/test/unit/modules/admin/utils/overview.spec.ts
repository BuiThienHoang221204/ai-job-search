import {
  buildAttention,
  comparableRate,
  previousSince,
  rate,
  topFailureKind,
  type AttentionInput,
} from 'src/modules/admin/utils/overview.js';

const now = new Date('2026-09-24T05:00:00Z');

const healthy: AttentionInput = {
  calls: 100,
  ok: 95,
  previousSuccessRate: 94,
  topFailure: null,
  failed: 5,
  queueWaiting: 0,
  portals: [{ portal: 'itviec', status: 'DONE', error: null }],
  lastScrapeAt: new Date('2026-09-23T16:00:00Z'),
  now,
};

describe('rate', () => {
  test('làm tròn 1 chữ số', () => {
    expect(rate(1, 3)).toBe(33.3);
  });

  test('chưa có lời gọi thì null chứ không phải 0%', () => {
    expect(rate(0, 0)).toBeNull();
  });
});

describe('previousSince', () => {
  test('cửa sổ trước có cùng độ dài, kết thúc ở đầu cửa sổ hiện tại', () => {
    const since = new Date('2026-09-23T06:00:00Z');
    expect(previousSince(since, now).toISOString()).toBe(
      '2026-09-22T07:00:00.000Z',
    );
  });
});

describe('buildAttention', () => {
  test('mọi thứ bình thường thì không có mục nào', () => {
    expect(buildAttention(healthy)).toEqual([]);
  });

  test('tỷ lệ thành công thấp nói luôn nguyên nhân chiếm đa số', () => {
    const [item] = buildAttention({
      ...healthy,
      ok: 51,
      failed: 49,
      topFailure: { kind: 'SCHEMA', count: 31 },
      previousSuccessRate: 78,
    });
    expect(item).toMatchObject({
      id: 'ai-success',
      severity: 'danger',
      title: 'AI chỉ thành công 51% (kỳ trước 78%)',
    });
    expect(item.detail).toContain('SCHEMA chiếm 63%');
  });

  test('ít lời gọi quá thì không báo động dù tỷ lệ thấp', () => {
    expect(buildAttention({ ...healthy, calls: 5, ok: 1 })).toEqual([]);
  });

  test('hàng đợi ứ và lượt quét hỏng là cảnh báo, xếp sau sự cố', () => {
    const items = buildAttention({
      ...healthy,
      ok: 10,
      queueWaiting: 120,
      portals: [{ portal: 'topcv', status: 'FAILED', error: '403' }],
    });
    expect(items.map((item) => item.id)).toEqual([
      'ai-success',
      'queue-backlog',
      'scrape-topcv',
    ]);
  });

  test('quá 26 giờ không có lượt quét nào thì nhắc cron', () => {
    const items = buildAttention({
      ...healthy,
      lastScrapeAt: new Date('2026-09-22T00:00:00Z'),
    });
    expect(items.map((item) => item.id)).toEqual(['scrape-stale']);
  });
});

describe('comparableRate', () => {
  test('kỳ có quá ít lời gọi thì không đem ra so', () => {
    expect(comparableRate(0, 2)).toBeNull();
  });

  test('đủ mẫu thì trả tỷ lệ', () => {
    expect(comparableRate(15, 20)).toBe(75);
  });
});

describe('topFailureKind', () => {
  test('lấy loại nhiều nhất, loại null tính là OTHER', () => {
    expect(
      topFailureKind([
        { kind: 'SCHEMA', count: 21 },
        { kind: null, count: 40 },
      ]),
    ).toEqual({ kind: 'OTHER', count: 40 });
  });

  test('không có lần hỏng nào thì null', () => {
    expect(topFailureKind([])).toBeNull();
  });
});
