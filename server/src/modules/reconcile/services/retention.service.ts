import { Injectable } from '@nestjs/common';
import { daysAgo } from '@/common/duration';
import { PrismaService } from '@/prisma/prisma.service';

const RETENTION_DAYS = 90;

@Injectable()
export class RetentionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Xoá nhật ký gọi AI và bộ đếm lượt của khách quá 90 ngày, đúng thời hạn ghi trong Chính sách bảo mật. */
  async purge(): Promise<void> {
    const cutoff = daysAgo(RETENTION_DAYS);
    await this.prisma.aiCall.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    await this.prisma.usageCounter.deleteMany({
      where: { day: { lt: cutoff } },
    });
  }
}
