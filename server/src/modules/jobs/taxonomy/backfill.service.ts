import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { derivedFields } from './derived.js';

/** Số tin xử lý mỗi lượt. Đủ nhỏ để không giữ cả bảng trong bộ nhớ. */
const BATCH_SIZE = 500;

export interface BackfillResult {
  processed: number;
  missingProvince: number;
}

/**
 * Điền ba trường dẫn xuất cho những tin đã có trước khi chúng ra đời.
 *
 * Là một service trong app chứ không phải script chạy rời: nó phải gọi đúng
 * `derivedFields` mà đường ghi thật gọi, và một script node trần thì không nạp
 * được TypeScript của app nên sẽ phải chép lại logic - bản chép đó lệch ngay
 * lần đầu ai đó sửa danh mục.
 */
@Injectable()
export class TaxonomyBackfillService {
  private readonly logger = new Logger(TaxonomyBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `all = true` tính lại TẤT CẢ, dùng sau khi sửa danh mục tỉnh hoặc ngành. */
  async run(all = false): Promise<BackfillResult> {
    const where = all ? {} : { searchText: null };
    let processed = 0;

    for (;;) {
      const batch = await this.prisma.job.findMany({
        where,
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        skip: all ? processed : 0,
        select: {
          id: true,
          title: true,
          company: true,
          location: true,
          tags: true,
        },
      });
      if (!batch.length) break;

      // Tuần tự chứ không Promise.all: một lượt backfill không vội, còn mở 500
      // kết nối cùng lúc thì đủ làm nghẽn database đang phục vụ người dùng thật.
      for (const job of batch) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: derivedFields(job.title, job.company, job.location, job.tags),
        });
      }

      processed += batch.length;
      this.logger.log(`Đã tính lại ${processed} tin`);
    }

    const missingProvince = await this.prisma.job.count({
      where: { provinceCode: null },
    });

    return { processed, missingProvince };
  }
}
