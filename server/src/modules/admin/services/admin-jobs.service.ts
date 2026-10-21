import { Injectable, NotFoundException } from '@nestjs/common';
import { messageOf } from '@/common/error-message';
import type { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { pageArgs, pageOf } from '@/common/pagination';
import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { QUEUE, QueueService } from '@/modules/queue/queue.service';
import { requirementBatches } from '@/modules/scraper/utils/requirement-batches';
import type { AdminJobsQueryDto } from '../admin.dto';
import { dateRange } from '../utils/filters';

const JOB_COUNTS = {
  _count: { select: { matches: true, duplicates: true, applications: true } },
} as const;

@Injectable()
export class AdminJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async list(query: AdminJobsQueryDto) {
    const where: Prisma.JobWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.canonicalOnly ? { duplicateOfId: null } : {}),
      ...(query.requirement === 'NONE'
        ? { requirements: { is: null } }
        : query.requirement
          ? { requirements: { is: { status: query.requirement } } }
          : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { company: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      scrapedAt: dateRange(query),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: [{ scrapedAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: {
          id: true,
          title: true,
          company: true,
          source: true,
          url: true,
          location: true,
          provinceCode: true,
          occupationCode: true,
          postedAt: true,
          scrapedAt: true,
          duplicateOfId: true,
          requirements: { select: { status: true, extractedAt: true } },
          ...JOB_COUNTS,
        },
      }),
      this.prisma.job.count({ where }),
    ]);
    return pageOf(items, total, query);
  }

  async sources(query: PaginationQueryDto) {
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['source'],
        _count: { _all: true },
        orderBy: { source: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.$queryRaw<{ total: number }[]>`
        select count(distinct source)::int as total from jobs`,
    ]);
    const items = rows.map((row) => ({
      source: row.source,
      count: row._count._all,
    }));
    return pageOf(items, total, query);
  }

  async detail(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        externalId: true,
        title: true,
        company: true,
        source: true,
        url: true,
        location: true,
        workMode: true,
        provinceCode: true,
        occupationCode: true,
        subOccupationCode: true,
        dedupeKey: true,
        salaryRaw: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        tags: true,
        description: true,
        postedAt: true,
        scrapedAt: true,
        requirements: {
          select: {
            status: true,
            requiredSkills: true,
            niceToHaveSkills: true,
            minYears: true,
            seniority: true,
            city: true,
            remotePolicy: true,
            workPermitRequired: true,
            citizenshipRequired: true,
            modelId: true,
            extractedAt: true,
            error: true,
          },
        },
        duplicateOf: {
          select: { id: true, title: true, company: true, source: true },
        },
        duplicates: {
          select: {
            id: true,
            title: true,
            company: true,
            source: true,
            scrapedAt: true,
          },
          orderBy: { scrapedAt: 'desc' },
          take: 20,
        },
        ...JOB_COUNTS,
      },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy tin: ${id}`);
    return job;
  }

  async reExtract(
    jobIds: string[],
  ): Promise<{ queued: number; message: string }> {
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: Array.from(new Set(jobIds)) } },
      select: { id: true },
    });
    const validIds = jobs.map((job) => job.id);
    if (!validIds.length) {
      throw new NotFoundException('Không tìm thấy tin hợp lệ để rút.');
    }

    await this.prisma.$transaction([
      this.prisma.jobRequirement.createMany({
        data: validIds.map((jobId) => ({ jobId, status: 'PENDING' as const })),
        skipDuplicates: true,
      }),
      this.prisma.jobRequirement.updateMany({
        where: { jobId: { in: validIds }, status: { not: 'RUNNING' } },
        data: { status: 'PENDING', error: null, sourceHash: null },
      }),
    ]);

    try {
      await this.queue.sendMany(
        QUEUE.EXTRACT_REQUIREMENTS,
        requirementBatches(validIds),
      );
    } catch (queueError) {
      await this.prisma.jobRequirement.updateMany({
        where: { jobId: { in: validIds }, status: 'PENDING' },
        data: {
          status: 'FAILED',
          error: `Không thể đưa vào hàng đợi: ${messageOf(queueError)}`,
        },
      });
      throw queueError;
    }

    return {
      queued: validIds.length,
      message: `Đã đưa ${validIds.length} tin vào hàng đợi rút yêu cầu.`,
    };
  }
}
