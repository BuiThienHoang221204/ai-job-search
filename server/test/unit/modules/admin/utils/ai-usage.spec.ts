import {
  byTokensDesc,
  fillBuckets,
  granularityFor,
  toUsageRow,
  vnBucket,
  windowStart,
  withFailed,
} from 'src/modules/admin/utils/ai-usage.js';

const sums = (calls: number, input: number | null, output: number | null) => ({
  _count: { _all: calls },
  _sum: { inputTokens: input, outputTokens: output, cachedTokens: null },
});

describe('toUsageRow', () => {
  test('token null (provider không báo) thành 0 chứ không NaN', () => {
    expect(toUsageRow(sums(3, null, null))).toEqual({
      calls: 3,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
    });
  });

  test('totalTokens = vào + ra, không cộng cached', () => {
    const row = toUsageRow({
      _count: { _all: 1 },
      _sum: { inputTokens: 100, outputTokens: 20, cachedTokens: 80 },
    });
    expect(row.totalTokens).toBe(120);
    expect(row.cachedTokens).toBe(80);
  });
});

describe('withFailed', () => {
  test('ghép số lần hỏng theo đúng khoá, khoá không hỏng thì 0', () => {
    const rows = withFailed(
      'modelId',
      [
        { modelId: 'a', ...sums(10, 1000, 100) },
        { modelId: 'b', ...sums(5, 500, 50) },
      ],
      [{ modelId: 'a', _count: { _all: 4 } }],
    );
    expect(rows.map((row) => [row.modelId, row.failed])).toEqual([
      ['a', 4],
      ['b', 0],
    ]);
  });
});

describe('byTokensDesc', () => {
  test('nhiều token lên đầu, hoà thì nhiều lời gọi lên đầu, không đổi mảng gốc', () => {
    const input = [
      { id: 'x', ...toUsageRow(sums(1, 10, 0)) },
      { id: 'y', ...toUsageRow(sums(5, 100, 0)) },
      { id: 'z', ...toUsageRow(sums(9, 10, 0)) },
    ];
    expect(byTokensDesc(input).map((row) => row.id)).toEqual(['y', 'z', 'x']);
    expect(input[0].id).toBe('x');
  });
});

describe('granularityFor', () => {
  test('24 giờ chia theo giờ, dài hơn chia theo ngày', () => {
    expect(granularityFor(1)).toBe('hour');
    expect(granularityFor(7)).toBe('day');
  });
});

describe('vnBucket', () => {
  test('17:30 UTC đã là ngày hôm sau ở Việt Nam', () => {
    expect(vnBucket(new Date('2026-09-24T17:30:00Z'), 'day')).toBe(
      '2026-09-25',
    );
  });

  test('khoá giờ theo giờ Việt Nam', () => {
    expect(vnBucket(new Date('2026-09-24T17:30:00Z'), 'hour')).toBe(
      '2026-09-25T00',
    );
  });
});

describe('windowStart', () => {
  // 12:40 giờ Việt Nam.
  const now = new Date('2026-09-24T05:40:00Z');

  test('24 giờ bắt đầu ở đầu giờ, 23 giờ trước', () => {
    // 13:00 hôm trước giờ Việt Nam = 06:00 UTC.
    expect(windowStart(1, now).toISOString()).toBe('2026-09-23T06:00:00.000Z');
  });

  test('7 ngày bắt đầu lúc 00:00 giờ Việt Nam của ngày đầu tiên', () => {
    // 00:00 ngày 18/09 giờ Việt Nam = 17:00 UTC ngày 17/09.
    expect(windowStart(7, now).toISOString()).toBe('2026-09-17T17:00:00.000Z');
  });
});

describe('fillBuckets', () => {
  const now = new Date('2026-09-24T05:00:00Z');
  const empty = (bucket: string) => ({
    bucket,
    calls: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
  });

  test('theo ngày: đủ số ngày, cũ trước mới sau, ngày trống ra 0', () => {
    const rows = fillBuckets(
      [
        {
          bucket: '2026-09-23',
          calls: 4,
          failed: 1,
          inputTokens: 40,
          outputTokens: 4,
        },
      ],
      3,
      now,
    );
    expect(rows).toEqual([
      empty('2026-09-22'),
      {
        bucket: '2026-09-23',
        calls: 4,
        failed: 1,
        inputTokens: 40,
        outputTokens: 4,
      },
      empty('2026-09-24'),
    ]);
  });

  test('theo giờ: đúng 24 ô, ô cuối là giờ hiện tại', () => {
    const rows = fillBuckets(
      [
        {
          bucket: '2026-09-24T12',
          calls: 2,
          failed: 0,
          inputTokens: 20,
          outputTokens: 2,
        },
      ],
      1,
      now,
    );
    expect(rows).toHaveLength(24);
    expect(rows[0].bucket).toBe('2026-09-23T13');
    expect(rows[23]).toEqual({
      bucket: '2026-09-24T12',
      calls: 2,
      failed: 0,
      inputTokens: 20,
      outputTokens: 2,
    });
  });

  test('bỏ ô nằm ngoài cửa sổ', () => {
    const rows = fillBuckets(
      [
        {
          bucket: '2026-09-01',
          calls: 9,
          failed: 0,
          inputTokens: 9,
          outputTokens: 9,
        },
      ],
      2,
      now,
    );
    expect(rows).toEqual([empty('2026-09-23'), empty('2026-09-24')]);
  });
});
