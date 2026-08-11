import type { AiFailureKind } from '../../generated/prisma/enums.js';

export type AiCallRow = {
  purpose: string;
  modelId: string;
  ok: boolean;
  failureKind: AiFailureKind | null;
  durationMs: number;
};

export type PurposeStats = {
  purpose: string;
  total: number;
  ok: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  failures: Record<string, number>;
};

export type AiHealth = {
  total: number;
  ok: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  failures: Record<string, number>;
  byPurpose: PurposeStats[];
  byModel: Array<{
    modelId: string;
    total: number;
    successRate: number;
    p50Ms: number;
  }>;
};

/// Phân vị theo phương pháp "nearest rank" trên mảng đã sắp.
///
/// Dùng p50/p95 chứ KHÔNG dùng trung bình: độ trễ gọi model có đuôi rất dài -
/// một lần 517 giây sẽ kéo trung bình lên và che mất thực tế là phần lớn lần
/// gọi đều nhanh. Trung bình ở đây nói dối một cách có hệ thống.
export function percentile(sortedMs: number[], p: number): number {
  if (!sortedMs.length) return 0;
  const rank = Math.ceil((p / 100) * sortedMs.length);
  return sortedMs[Math.min(rank, sortedMs.length) - 1];
}

const summarise = (rows: AiCallRow[]) => {
  const durations = rows.map((row) => row.durationMs).sort((a, b) => a - b);
  const ok = rows.filter((row) => row.ok).length;
  const failures: Record<string, number> = {};
  for (const row of rows) {
    if (row.ok) continue;
    const kind = row.failureKind ?? 'OTHER';
    failures[kind] = (failures[kind] ?? 0) + 1;
  }

  return {
    total: rows.length,
    ok,
    // Làm tròn 1 chữ số thập phân: 97.3% và 97% là hai thông điệp khác nhau
    // khi bạn đang quyết định có đổi nhà cung cấp hay không.
    successRate: rows.length ? Math.round((ok / rows.length) * 1000) / 10 : 0,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    failures,
  };
};

export function buildAiHealth(rows: AiCallRow[]): AiHealth {
  const byPurposeMap = new Map<string, AiCallRow[]>();
  const byModelMap = new Map<string, AiCallRow[]>();

  for (const row of rows) {
    byPurposeMap.set(row.purpose, [
      ...(byPurposeMap.get(row.purpose) ?? []),
      row,
    ]);
    byModelMap.set(row.modelId, [...(byModelMap.get(row.modelId) ?? []), row]);
  }

  return {
    ...summarise(rows),
    byPurpose: [...byPurposeMap.entries()]
      .map(([purpose, group]) => ({ purpose, ...summarise(group) }))
      // Tác vụ hỏng nhiều nhất lên đầu: đó là chỗ cần sửa trước.
      .sort((a, b) => a.successRate - b.successRate || b.total - a.total),
    byModel: [...byModelMap.entries()]
      .map(([modelId, group]) => {
        const stats = summarise(group);
        return {
          modelId,
          total: stats.total,
          successRate: stats.successRate,
          p50Ms: stats.p50Ms,
        };
      })
      .sort((a, b) => b.total - a.total),
  };
}
