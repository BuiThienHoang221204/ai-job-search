import type { ReadinessReport } from 'src/modules/health/health.service.js';
import { toPublicReadiness } from 'src/modules/health/utils/public-readiness.js';

describe('toPublicReadiness', () => {
  test('giữ cờ ok của từng phép kiểm, bỏ thông báo lỗi', () => {
    const report: ReadinessReport = {
      ready: false,
      checks: {
        database: {
          ok: false,
          error: "Can't reach database server at postgres:5432",
        },
        queue: { ok: true },
        latex: { ok: false, error: 'môi trường tạo PDF không phản hồi' },
        pdf: { ok: true },
      },
    };

    const body = toPublicReadiness(report);

    expect(body).toEqual({
      ready: false,
      checks: {
        database: { ok: false },
        queue: { ok: true },
        latex: { ok: false },
        pdf: { ok: true },
      },
    });
    expect(JSON.stringify(body)).not.toContain('postgres:5432');
  });
});
