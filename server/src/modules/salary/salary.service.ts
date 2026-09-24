import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListPositionsQueryDto } from './salary.dto.js';
import {
  buildPositionIndex,
  resolveJobPosition,
} from './utils/job-position.js';
import { negotiationRange } from './utils/negotiation.js';
import { occupationName, orderBands, rankPeers } from './utils/salary-view.js';
import type {
  PositionIndex,
  SalaryGuide,
  SalaryGuideJob,
  SalaryGuideProfile,
  SalaryGuideRequirements,
} from './salary.types.js';

/** Số vị trí cùng ngành hiển thị trong bảng xếp hạng. */
const PEER_LIMIT = 6;

/** Bảng tham chiếu đổi theo lượt crawl chứ không theo request, nên cache 10 phút là quá đủ. */
const INDEX_CACHE_MS = 10 * 60_000;

/** Chỉ đọc cột cần cho việc dò tên — kéo cả bản ghi về rồi vứt là tốn băng thông mỗi 10 phút. */
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

/** Cửa DUY NHẤT để đọc dữ liệu lương — đổi sang nguồn thống kê từ kho tin sau này chỉ sửa trong đây. */
@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  private index: PositionIndex | null = null;
  private indexUntil = 0;

  /** Dựng bảng tra một lần rồi giữ trong bộ nhớ; mỗi request tự dò tên sẽ là một lần quét cả bảng lương. */
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

  /** Không dò ra vị trí thì trả `null` chứ không đoán — một khoảng lương bịa còn tệ hơn không có khoảng nào. */
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

  /** Danh mục ngành kèm số vị trí đang có số, để giao diện dựng thanh lọc. */
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

  /** Mã ngành lạ đã bị `ListPositionsQueryDto` chặn ở tầng validate, không rơi tới đây. */
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

  /** Các vị trí cùng ngành, xếp theo lương giảm dần, để một con số lẻ có chỗ đứng. */
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
