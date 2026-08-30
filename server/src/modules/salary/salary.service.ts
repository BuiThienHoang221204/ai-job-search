import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OCCUPATIONS } from '../jobs/taxonomy/occupations.js';
import type { ListPositionsQueryDto } from './salary.dto.js';

const OCCUPATION_NAMES = new Map(OCCUPATIONS.map((o) => [o.code, o.name]));

/** Số vị trí cùng ngành hiển thị trong bảng xếp hạng. */
const PEER_LIMIT = 6;

/**
 * Cửa DUY NHẤT để đọc dữ liệu lương.
 *
 * Hiện chỉ có một nguồn là bảng tham chiếu, nhưng mọi thứ trả ra đều mang theo
 * `provider` và `providerUrl`. Khi thống kê từ kho tin của hệ thống đủ mẫu, chỗ
 * đổi nguồn nằm gọn trong service này và giao diện không phải sửa gì.
 */
@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh mục ngành kèm số vị trí đang có số, để giao diện dựng thanh lọc. */
  async occupations() {
    const grouped = await this.prisma.salaryReference.groupBy({
      by: ['occupationCode'],
      where: { visibility: 'PUBLIC', occupationCode: { not: null } },
      _count: { _all: true },
    });

    return grouped
      .map((row) => ({
        code: row.occupationCode as string,
        name:
          OCCUPATION_NAMES.get(row.occupationCode as string) ??
          row.occupationCode,
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
      select: {
        positionSlug: true,
        positionName: true,
        occupationCode: true,
        avgMonthly: true,
        rangeMin: true,
        rangeMax: true,
        currency: true,
      },
      orderBy: [{ avgMonthly: 'desc' }, { positionName: 'asc' }],
    });

    return rows.map((row) => ({
      ...row,
      occupationName: OCCUPATION_NAMES.get(row.occupationCode ?? '') ?? null,
    }));
  }

  async position(slug: string) {
    const row = await this.prisma.salaryReference.findFirst({
      where: { positionSlug: slug, visibility: 'PUBLIC' },
      include: {
        bands: {
          select: {
            experienceLabel: true,
            minAmount: true,
            avgAmount: true,
            maxAmount: true,
          },
        },
      },
    });

    if (!row)
      throw new NotFoundException('Không có dữ liệu lương cho vị trí này');

    return {
      positionSlug: row.positionSlug,
      positionName: row.positionName,
      occupationCode: row.occupationCode,
      occupationName: OCCUPATION_NAMES.get(row.occupationCode ?? '') ?? null,
      provider: 'x-interview',
      providerUrl: row.sourceUrl,
      updatedAt: row.fetchedAt,
      sampleSize: null,
      currency: row.currency,
      avgMonthly: row.avgMonthly,
      rangeMin: row.rangeMin,
      rangeMax: row.rangeMax,
      bands: this.orderBands(row.bands),
      peers: await this.peers(row.occupationCode, row.positionSlug),
    };
  }

  /**
   * Các vị trí cùng ngành, xếp theo lương giảm dần, để một con số lẻ có chỗ đứng.
   *
   * Vị trí đang xem LUÔN nằm trong danh sách kể cả khi nó không lọt top - thiếu
   * nó thì bảng xếp hạng không nói được người đọc đang đứng ở đâu.
   */
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

    const top = rows.slice(0, PEER_LIMIT);
    const current = rows.find((r) => r.positionSlug === currentSlug);
    if (current && !top.some((r) => r.positionSlug === currentSlug)) {
      top.push(current);
    }

    return top.map((r) => ({
      ...r,
      rank: rows.findIndex((x) => x.positionSlug === r.positionSlug) + 1,
      isCurrent: r.positionSlug === currentSlug,
    }));
  }

  /**
   * Xếp các mốc kinh nghiệm theo thứ tự thời gian.
   *
   * Nhãn giữ nguyên chữ của nguồn nên không sắp theo bảng chữ cái được: "1–3 năm"
   * phải đứng sau "Dưới 1 năm".
   */
  private orderBands(bands: { experienceLabel: string }[]) {
    const order = ['Dưới 1 năm', '1–3 năm', '3–5 năm', 'Trên 5 năm'];
    return [...bands].sort(
      (a, b) =>
        order.indexOf(a.experienceLabel) - order.indexOf(b.experienceLabel),
    );
  }
}
