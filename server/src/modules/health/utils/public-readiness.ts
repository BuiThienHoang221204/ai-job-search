import type { ReadinessReport } from '../health.service';

export type PublicReadiness = {
  ready: boolean;
  checks: Record<keyof ReadinessReport['checks'], { ok: boolean }>;
};

export function toPublicReadiness(report: ReadinessReport): PublicReadiness {
  const checks = Object.fromEntries(
    Object.entries(report.checks).map(([name, check]) => [
      name,
      { ok: check.ok },
    ]),
  ) as PublicReadiness['checks'];
  return { ready: report.ready, checks };
}
