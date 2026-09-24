import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { AdminJobsQueryDto } from '../admin.dto.js';

const JOB_COUNTS = {
  _count: { select: { matches: true, duplicates: true, applications: true } },
} as const;

@Injectable()
export class AdminJobsService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Nguồn tin và số tin mỗi nguồn, để dựng bộ lọc. */
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
}
