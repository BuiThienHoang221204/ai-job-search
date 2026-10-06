import {
  dateRange,
  failuresWhere,
  registeredOnly,
} from 'src/modules/admin/utils/filters.js';
import type { FailuresQueryDto } from 'src/modules/admin/admin.dto.js';

describe('dateRange', () => {
  test('không có mốc nào thì không lọc', () => {
    expect(dateRange({})).toBeUndefined();
  });

  test('khoảng nửa mở [from, to)', () => {
    expect(dateRange({ from: '2026-10-01', to: '2026-10-02' })).toEqual({
      gte: new Date('2026-10-01'),
      lt: new Date('2026-10-02'),
    });
  });
});

describe('registeredOnly', () => {
  test('bỏ lượt của portal đã gỡ khỏi registry', () => {
    const rows = [{ portal: 'topcv' }, { portal: 'jobsgo' }];
    expect(registeredOnly(rows, ['topcv'])).toEqual([{ portal: 'topcv' }]);
  });
});

describe('failuresWhere', () => {
  const query = (patch: Partial<FailuresQueryDto>) =>
    ({ page: 1, pageSize: 20, ...patch }) as FailuresQueryDto;

  test('lọc OTHER thì lấy cả failureKind null', () => {
    expect(failuresWhere(query({ failureKind: 'OTHER' }))).toMatchObject({
      ok: false,
      OR: [{ failureKind: 'OTHER' }, { failureKind: null }],
    });
  });

  test('lọc model khớp cả provider lẫn modelId', () => {
    const where = failuresWhere(query({ model: 'groq' }));
    expect(where.AND).toEqual([
      {
        OR: [
          { modelId: { contains: 'groq', mode: 'insensitive' } },
          { provider: { contains: 'groq', mode: 'insensitive' } },
        ],
      },
    ]);
  });
});
