import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { dedupeKeyOf } from '../../jobs/taxonomy/dedupe.js';

import { derivedFields, resolveProvince } from '../../jobs/taxonomy/resolve.js';
import { JobSourceRouter } from './job-source.router.js';
import {
  MIN_DESCRIPTION_LENGTH,
  looksTruncated,
  parsePostedAt,
} from '../utils/normalize.js';
import type { PortalJobCard, SaveOutcome, SaveResult } from '../types.js';

/** Chỉ gộp trùng trong 30 ngày: tin cũ đã hết hạn không được nuốt mất tin cùng tên đăng lại mùa sau. */
const DEDUPE_WINDOW_MS = 30 * 86_400_000;

/** LƯU tin: tách tin mới, lấy mô tả đầy đủ, tính trường dẫn xuất, nhận ra bản sao giữa portal. KHÔNG phải provider Nest, `ScraperService` tự dựng. */
export class JobWriter {
  private readonly logger = new Logger(JobWriter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portals: JobSourceRouter,
  ) {}

  /** Tin ĐÃ CÓ chỉ làm mới dữ liệu thẻ, không gọi `detail` lần nữa — đó là chỗ tốn tiền nhất mỗi đêm. */
  async save(portal: string, cards: PortalJobCard[]): Promise<SaveOutcome> {
    const existing = await this.prisma.job.findMany({
      where: { source: portal, externalId: { in: cards.map((c) => c.id) } },
      select: { externalId: true },
    });
    const known = new Set(existing.map((job) => job.externalId));
    const fresh = cards.filter((card) => !known.has(card.id));

    this.logger.log(
      `${cards.length} tin tìm được, ${fresh.length} tin mới, ${known.size} đã có`,
    );

    const refreshed = await this.refreshKnownCards(
      portal,
      cards.filter((card) => known.has(card.id)),
    );
    if (refreshed) {
      this.logger.log(`Làm mới dữ liệu thẻ cho ${refreshed} tin đã có`);
    }

    const savedJobIds: string[] = [];
    let skipped = 0;
    let merged = 0;

    for (const card of fresh) {
      try {
        const result = await this.saveCard(portal, card);
        if (result.kind === 'skipped') skipped += 1;
        else if (result.kind === 'merged') merged += 1;
        else savedJobIds.push(result.jobId);
      } catch (error) {
        skipped += 1;
        this.logger.warn(
          `Bỏ qua ${card.slug}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (skipped || merged) {
      this.logger.log(
        `Đã bỏ qua ${skipped}/${fresh.length} tin mới, gộp ${merged} tin trùng portal khác; lưu được ${savedJobIds.length}`,
      );
    }

    return {
      savedJobIds,
      found: cards.length,
      fresh: fresh.length,
      skipped,
      merged,
    };
  }

  /** Lưu MỘT tin. Nói rõ vì sao một tin không có id để đưa vào việc nền. */
  private async saveCard(
    portal: string,
    card: PortalJobCard,
  ): Promise<SaveResult> {
    let description = card.description ?? null;
    if (!description || looksTruncated(description)) {
      const full = await this.detailDescription(portal, card.slug);
      description = full ?? description;
    }

    if (!description || description.length < MIN_DESCRIPTION_LENGTH) {
      this.logger.warn(`Bỏ qua ${card.slug}: mô tả quá ngắn hoặc trống`);
      return { kind: 'skipped' };
    }

    const postedAt = parsePostedAt(card.postedAt);
    const company = card.company ?? 'Không rõ';
    const derived = derivedFields(
      card.title,
      company,
      card.location,
      card.tags,
    );
    const duplicateOfId = await this.findOriginal(derived.dedupeKey);

    const job = await this.prisma.job.upsert({
      where: { source_externalId: { source: portal, externalId: card.id } },
      create: {
        duplicateOfId,
        source: portal,
        externalId: card.id,
        url: card.url,
        title: card.title,
        company,
        companyLogo: card.companyLogo,
        location: card.location,
        workMode: card.workMode,
        salaryRaw: card.salary,
        tags: card.tags,
        description,
        postedAt,
        ...derived,
      },
      update: {
        description,
        salaryRaw: card.salary,
        ...(postedAt ? { postedAt } : {}),
        ...(card.companyLogo ? { companyLogo: card.companyLogo } : {}),
        ...derived,
      },
    });

    return duplicateOfId
      ? { kind: 'merged' }
      : { kind: 'saved', jobId: job.id };
  }

  /** Id bản gốc ở portal khác, `null` khi đây là tin đầu tiên mang vân tay đó. */
  private async findOriginal(dedupeKey: string | null): Promise<string | null> {
    if (!dedupeKey) return null;

    const original = await this.prisma.job.findFirst({
      where: {
        dedupeKey,
        duplicateOfId: null,
        scrapedAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      orderBy: { scrapedAt: 'asc' },
      select: { id: true },
    });
    return original?.id ?? null;
  }

  /** NUỐT lỗi thay vì để nổi lên: thẻ có thể đã mang mô tả cụt nhưng dùng được, ném ở đây là mất luôn cả tin. */
  private async detailDescription(
    portal: string,
    slug: string,
  ): Promise<string | null> {
    try {
      const detail = await this.portals.detail(portal, slug);
      return detail.description;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không lấy được mô tả đầy đủ của ${slug}: ${message}`);
      return null;
    }
  }

  /** Cập nhật dữ liệu THẺ cho những tin đã có trong database. */
  private async refreshKnownCards(
    portal: string,
    cards: PortalJobCard[],
  ): Promise<number> {
    let updated = 0;

    for (const card of cards) {
      const postedAt = parsePostedAt(card.postedAt);
      const data = {
        ...(card.companyLogo ? { companyLogo: card.companyLogo } : {}),
        ...(postedAt ? { postedAt } : {}),
        ...(card.salary ? { salaryRaw: card.salary } : {}),
        ...(card.location
          ? {
              location: card.location,
              provinceCode: resolveProvince(card.location),
              dedupeKey: dedupeKeyOf(
                card.title,
                card.company ?? 'Không rõ',
                resolveProvince(card.location),
              ),
            }
          : {}),
      };
      if (!Object.keys(data).length) continue;

      try {
        await this.prisma.job.update({
          where: { source_externalId: { source: portal, externalId: card.id } },
          data,
        });
        updated += 1;
      } catch (error) {
        this.logger.warn(
          `Không làm mới được ${card.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return updated;
  }
}
