import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildAiHealth, type AiHealth } from './ai-health.js';

/// Trần số bản ghi đọc lên để tính phân vị. Đủ rộng để có ý nghĩa thống kê,
/// đủ hẹp để không kéo cả bảng lên bộ nhớ khi nhật ký lớn dần.
const MAX_ROWS = 5_000;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async aiHealth(days: number): Promise<AiHealth & { windowDays: number }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.aiCall.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        purpose: true,
        modelId: true,
        ok: true,
        failureKind: true,
        durationMs: true,
      },
    });

    return { ...buildAiHealth(rows), windowDays: days };
  }

  /// Các lần hỏng gần nhất, kèm thông báo thật. Bảng tổng hợp cho biết CÓ vấn
  /// đề; danh sách này cho biết vấn đề là gì.
  recentFailures(limit: number) {
    return this.prisma.aiCall.findMany({
      where: { ok: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        purpose: true,
        modelId: true,
        failureKind: true,
        errorMessage: true,
        durationMs: true,
        createdAt: true,
      },
    });
  }
}
