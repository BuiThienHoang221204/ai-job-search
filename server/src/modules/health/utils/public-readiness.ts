import type { ReadinessReport } from '../health.service.js';

export type PublicReadiness = {
  ready: boolean;
  checks: Record<keyof ReadinessReport['checks'], { ok: boolean }>;
};

// /ready là route công khai: chỉ báo phép kiểm nào hỏng, bỏ thông báo lỗi vì nó chứa host, cổng và lỗi driver.
export function toPublicReadiness(report: ReadinessReport): PublicReadiness {
  const checks = Object.fromEntries(
    Object.entries(report.checks).map(([name, check]) => [
      name,
      { ok: check.ok },
    ]),
  ) as PublicReadiness['checks'];
  return { ready: report.ready, checks };
}
