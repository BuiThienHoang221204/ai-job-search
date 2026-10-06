import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { ListPositionsQueryDto } from './salary.dto';
import { buildPositionIndex, resolveJobPosition } from './utils/job-position';
import { negotiationRange } from './utils/negotiation';
import { occupationName, orderBands, rankPeers } from './utils/salary-view';
import type {
  PositionIndex,
  SalaryGuide,
  SalaryGuideJob,
  SalaryGuideProfile,
  SalaryGuideRequirements,
} from './salary.types';

const PEER_LIMIT = 6;

const INDEX_CACHE_MS = 10 * 60_000;

const INDEX_SELECT = {
  positionSlug: true,
  positionName: true,
  occupationCode: true,
  avgMonthly: true,
  rangeMin: true,
  rangeMax: true,
  currency: true,
  bands: {
    select: {
      experienceLabel: true,
      minAmount: true,
      avgAmount: true,
      maxAmount: true,
    },
  },
} as const;

@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  private index: PositionIndex | null = null;
  private indexUntil = 0;

  private async positionIndex(): Promise<PositionIndex> {
    if (this.index && Date.now() < this.indexUntil) return this.index;

    const rows = await this.prisma.salaryReference.findMany({
      where: { visibility: 'PUBLIC' },
      select: INDEX_SELECT,
    });

    this.index = buildPositionIndex(rows);
    this.indexUntil = Date.now() + INDEX_CACHE_MS;
    return this.index;
  }

  async guideForJob(
    job: SalaryGuideJob,
    requirements: SalaryGuideRequirements | null,
    fitScore: number | null,
    profile: SalaryGuideProfile | null = null,
  ): Promise<SalaryGuide | null> {
    const resolved = resolveJobPosition(job, await this.positionIndex());
    if (!resolved) return null;

    const range = negotiationRange({
      resolved,
      candidateYears: profile?.candidateYears ?? null,
      minYears: requirements?.minYears ?? null,
      seniority: requirements?.seniority ?? 'UNKNOWN',
      fitScore,
      postedMin: job.salaryMin,
      postedMax: job.salaryMax,
      currentSalary: profile?.currentSalary ?? null,
      expectedSalary: profile?.expectedSalary ?? null,
    });
    if (!range) return null;

    return {
      ...range,
      positionSlug:
        resolved.basis === 'POSITION'
          ? resolved.positions[0].positionSlug
          : null,
    };
  }

  async occupations() {
    const grouped = await this.prisma.salaryReference.groupBy({
      by: ['occupationCode'],
      where: { visibility: 'PUBLIC', occupationCode: { not: null } },
      _count: { _all: true },
    });

    return grouped
      .map((row) => ({
        code: row.occupationCode!,
        name: occupationName(row.occupationCode) ?? row.occupationCode!,
        positionCount: row._count._all,
      }))
      .sort((a, b) => b.positionCount - a.positionCount);
  }

  async positions(query: ListPositionsQueryDto) {
    const rows = await this.prisma.salaryReference.findMany({
      where: {
        visibility: 'PUBLIC',
        occupationCode: query.occupation ? query.occupation : { not: null },
        ...(query.q
          ? { positionName: { contains: query.q, mode: 'insensitive' } }
          : {}),
      },
      select: { ...INDEX_SELECT, bands: false },
      orderBy: [{ avgMonthly: 'desc' }, { positionName: 'asc' }],
    });

    return rows.map((row) => ({
      ...row,
      occupationName: occupationName(row.occupationCode),
    }));
  }

  async position(slug: string) {
    const row = await this.prisma.salaryReference.findFirst({
      where: { positionSlug: slug, visibility: 'PUBLIC' },
      include: { bands: { select: INDEX_SELECT.bands.select } },
    });

    if (!row)
      throw new NotFoundException('Không có dữ liệu lương cho vị trí này');

    return {
      positionSlug: row.positionSlug,
      positionName: row.positionName,
      occupationCode: row.occupationCode,
      occupationName: occupationName(row.occupationCode),
      provider: 'x-interview',
      providerUrl: row.sourceUrl,
      updatedAt: row.fetchedAt,
      sampleSize: null,
      currency: row.currency,
      avgMonthly: row.avgMonthly,
      rangeMin: row.rangeMin,
      rangeMax: row.rangeMax,
      bands: orderBands(row.bands),
      peers: await this.peers(row.occupationCode, row.positionSlug),
    };
  }

  private async peers(occupationCode: string | null, currentSlug: string) {
    if (!occupationCode) return [];

    const rows = await this.prisma.salaryReference.findMany({
      where: {
        visibility: 'PUBLIC',
        occupationCode,
        avgMonthly: { not: null },
      },
      select: { positionSlug: true, positionName: true, avgMonthly: true },
      orderBy: { avgMonthly: 'desc' },
    });

    return rankPeers(rows, currentSlug, PEER_LIMIT);
  }
}
