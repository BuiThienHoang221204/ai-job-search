import {
  buildAiHealth,
  percentile,
  type AiCallRow,
} from 'src/modules/admin/ai-health.js';

const call = (
  overrides: Partial<AiCallRow> & Pick<AiCallRow, 'ok' | 'durationMs'>,
): AiCallRow => ({
  purpose: 'match.evaluate',
  modelId: 'deepseek-v4-flash-free',
  failureKind: null,
  ...overrides,
});

describe('percentile', () => {
  test('p50 trên mảng lẻ lấy phần tử giữa', () => {
    expect(percentile([10, 20, 30], 50)).toBe(20);
  });

  test('p95 lấy gần cuối', () => {
    expect(
      percentile(
        [...Array(100).keys()].map((n) => n + 1),
        95,
      ),
    ).toBe(95);
  });

  test('p100 lấy lớn nhất', () => {
    expect(percentile([1, 2, 3], 100)).toBe(3);
  });

  test('mảng rỗng trả 0 thay vì NaN', () => {
    expect(percentile([], 50)).toBe(0);
  });

  test('một phần tử trả chính nó', () => {
    expect(percentile([42], 95)).toBe(42);
  });
});

describe('buildAiHealth', () => {
  test('tính đúng tỷ lệ thành công', () => {
    const health = buildAiHealth([
      call({ ok: true, durationMs: 1000 }),
      call({ ok: true, durationMs: 2000 }),
      call({ ok: false, durationMs: 3000, failureKind: 'TIMEOUT' }),
      call({ ok: true, durationMs: 4000 }),
    ]);
    expect(health.total).toBe(4);
    expect(health.ok).toBe(3);
    expect(health.successRate).toBe(75);
  });

  test('làm tròn tỷ lệ đến 1 chữ số thập phân', () => {
    // 97% và 97.3% là hai thông điệp khác nhau khi quyết định đổi nhà cung cấp.
    const rows: AiCallRow[] = [
      ...Array.from({ length: 97 }, () => call({ ok: true, durationMs: 100 })),
      ...Array.from({ length: 3 }, () =>
        call({ ok: false, durationMs: 100, failureKind: 'OTHER' }),
      ),
    ];
    expect(buildAiHealth(rows).successRate).toBe(97);
  });

  test('đếm nguyên nhân hỏng theo từng loại', () => {
    const health = buildAiHealth([
      call({ ok: false, durationMs: 1, failureKind: 'SCHEMA' }),
      call({ ok: false, durationMs: 1, failureKind: 'SCHEMA' }),
      call({ ok: false, durationMs: 1, failureKind: 'TIMEOUT' }),
      call({ ok: true, durationMs: 1 }),
    ]);
    expect(health.failures).toEqual({ SCHEMA: 2, TIMEOUT: 1 });
  });

  test('p95 KHÔNG bị một lần chậm bất thường kéo lên như trung bình', () => {
    // Đã đo được một lần gọi 517 giây. Trung bình của bộ này là ~52 giây -
    // che mất thực tế là 9/10 lần đều dưới 1 giây.
    const rows: AiCallRow[] = [
      ...Array.from({ length: 9 }, () => call({ ok: true, durationMs: 800 })),
      call({ ok: true, durationMs: 517_000 }),
    ];
    const health = buildAiHealth(rows);
    expect(health.p50Ms).toBe(800);
    const trungBinh =
      rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length;
    expect(health.p50Ms).toBeLessThan(trungBinh);
  });

  test('tách theo tác vụ, tác vụ hỏng nhiều nhất lên đầu', () => {
    const health = buildAiHealth([
      call({ purpose: 'match.evaluate', ok: true, durationMs: 1 }),
      call({ purpose: 'match.evaluate', ok: true, durationMs: 1 }),
      call({
        purpose: 'document.cv',
        ok: false,
        durationMs: 1,
        failureKind: 'SCHEMA',
      }),
      call({
        purpose: 'document.cv',
        ok: false,
        durationMs: 1,
        failureKind: 'SCHEMA',
      }),
    ]);
    expect(health.byPurpose[0].purpose).toBe('document.cv');
    expect(health.byPurpose[0].successRate).toBe(0);
    expect(health.byPurpose[1].successRate).toBe(100);
  });

  test('tách theo model, model dùng nhiều nhất lên đầu', () => {
    const health = buildAiHealth([
      call({ modelId: 'free', ok: true, durationMs: 1 }),
      call({ modelId: 'free', ok: false, durationMs: 1, failureKind: 'OTHER' }),
      call({ modelId: 'paid', ok: true, durationMs: 1 }),
    ]);
    expect(health.byModel[0].modelId).toBe('free');
    expect(health.byModel[0].total).toBe(2);
    expect(health.byModel[0].successRate).toBe(50);
  });

  test('failureKind null được gom vào OTHER', () => {
    const health = buildAiHealth([
      call({ ok: false, durationMs: 1, failureKind: null }),
    ]);
    expect(health.failures).toEqual({ OTHER: 1 });
  });

  test('chưa có dữ liệu thì trả số 0, không ném lỗi', () => {
    const health = buildAiHealth([]);
    expect(health).toMatchObject({ total: 0, ok: 0, successRate: 0, p50Ms: 0 });
    expect(health.byPurpose).toEqual([]);
  });
});
