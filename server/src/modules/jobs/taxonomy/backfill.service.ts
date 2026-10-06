import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { derivedFields } from './resolve';

const BATCH_SIZE = 500;

export interface BackfillResult {
  processed: number;
  missingProvince: number;
  missingDedupeKey: number;
}

@Injectable()
export class TaxonomyBackfillService {
  private readonly logger = new Logger(TaxonomyBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

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

      for (const job of batch) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: derivedFields(job.title, job.company, job.location, job.tags),
        });
      }

      processed += batch.length;
      this.logger.log(`Đã tính lại ${processed} tin`);
    }

    const [missingProvince, missingDedupeKey] = await Promise.all([
      this.prisma.job.count({ where: { provinceCode: null } }),
      this.prisma.job.count({ where: { dedupeKey: null } }),
    ]);

    return { processed, missingProvince, missingDedupeKey };
  }
}
