import { BadRequestException, Injectable } from '@nestjs/common';
import { fingerprint } from '@/common/fingerprint';
import { JobsService } from '@/modules/jobs/jobs.service';
import { derivedFields } from '@/modules/jobs/taxonomy/resolve';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PrismaService } from '@/prisma/prisma.service';
import { cleanUrl } from './clean-url';
import type { ExtSaveJobDto } from './ext-jobs.dto';

@Injectable()
export class ExtJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  async save(
    userId: string,
    dto: ExtSaveJobDto,
  ): Promise<{ jobId: string; saved: boolean }> {
    const jobId = await this.jobIdFor(dto);
    await this.jobs.save(userId, jobId);
    return { jobId, saved: true };
  }

  /** Dùng lại Job sẵn có cùng `url` (đã scrape hoặc lưu trước) để khỏi nhân đôi; chưa có thì tạo Job nguồn `extension`. Khoá `(source, externalId=fingerprint(url))` + bắt `P2002` để hai lần lưu đồng thời cùng url không sinh hai Job (`upsert` của Prisma không atomic đáng tin). */
  private async jobIdFor(dto: ExtSaveJobDto): Promise<string> {
    const url = cleanUrl(dto.url);
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException('Link tin không hợp lệ.');
    }
    const existing = await this.prisma.job.findFirst({
      where: { OR: [{ url }, { url: dto.url }] },
      select: { id: true },
    });
    if (existing) return existing.id;

    const title = dto.title.trim();
    const company = dto.company?.trim() || 'Không rõ';
    const location = dto.locationText?.trim() || null;
    const salaryRaw = dto.salaryText?.trim() || null;
    const posted = dto.postedText ? new Date(dto.postedText) : null;
    const postedAt = posted && !Number.isNaN(posted.getTime()) ? posted : null;
    const externalId = fingerprint([url]);
    try {
      const created = await this.prisma.job.create({
        data: {
          source: 'extension',
          externalId,
          url,
          title,
          company,
          companyLogo: dto.logoUrl?.trim() || null,
          location,
          salaryRaw,
          postedAt,
          description: dto.descriptionText,
          ...derivedFields(title, company, location, [], [], salaryRaw),
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const row = await this.prisma.job.findUniqueOrThrow({
        where: { source_externalId: { source: 'extension', externalId } },
        select: { id: true },
      });
      return row.id;
    }
  }
}
