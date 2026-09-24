import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { foldTerm } from '../../../common/text/vietnamese.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { QUEUE, QueueService } from '../../queue/queue.service.js';
import type { SkillsQueryDto } from '../admin.dto.js';

/** Số kỹ năng gần nhất theo embedding gợi ý để gộp. */
const NEIGHBORS = 8;

@Injectable()
export class AdminSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async summary() {
    const [skills, aliases] = await Promise.all([
      this.prisma.canonicalSkill.count(),
      this.prisma.skillAlias.groupBy({
        by: ['source'],
        _count: { _all: true },
      }),
    ]);
    return {
      skills,
      aliases: Object.fromEntries(
        aliases.map((row) => [row.source, row._count._all]),
      ),
    };
  }

  async list(query: SkillsQueryDto) {
    const where: Prisma.CanonicalSkillWhereInput = {
      ...(query.source ? { aliases: { some: { source: query.source } } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              {
                aliases: {
                  some: { raw: { contains: query.q, mode: 'insensitive' } },
                },
              },
              { aliases: { some: { key: { contains: foldTerm(query.q) } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.canonicalSkill.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
        select: {
          id: true,
          name: true,
          model: true,
          createdAt: true,
          _count: { select: { aliases: true } },
          aliases: {
            select: { key: true, raw: true, source: true },
            orderBy: { createdAt: 'asc' },
            take: 6,
          },
        },
      }),
      this.prisma.canonicalSkill.count({ where }),
    ]);
    return pageOf(items, total, query);
  }

  async detail(id: string) {
    const skill = await this.prisma.canonicalSkill.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        model: true,
        createdAt: true,
        aliases: {
          select: { key: true, raw: true, source: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!skill) throw new NotFoundException(`Không tìm thấy kỹ năng: ${id}`);

    // Chỉ so trong cùng model embedding: vector của hai model khác nhau không so được.
    const neighbors = await this.prisma.$queryRaw<
      { id: string; name: string; similarity: number; aliases: number }[]
    >`
      select c.id, c.name,
             (1 - (c.embedding <=> t.embedding))::float8 as similarity,
             (select count(*)::int from skill_aliases a where a."skillId" = c.id) as aliases
      from canonical_skills c, canonical_skills t
      where t.id = ${id} and c.model = t.model and c.id <> t.id
      order by c.embedding <=> t.embedding
      limit ${NEIGHBORS}`;

    return { ...skill, neighbors };
  }

  /** Chỉ đổi tên hiển thị; embedding giữ nguyên nên việc tìm ứng viên cho chuỗi mới không đổi. */
  async rename(id: string, name: string) {
    await this.ensureSkill(id);
    return this.prisma.canonicalSkill.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });
  }

  /** Chuyển một cách viết sang kỹ năng khác và đánh dấu MANUAL; kỹ năng cũ hết alias thì xoá luôn. */
  async moveAlias(key: string, skillId: string) {
    const [alias] = await Promise.all([
      this.prisma.skillAlias.findUnique({ where: { key } }),
      this.ensureSkill(skillId),
    ]);
    if (!alias) throw new NotFoundException(`Không tìm thấy cách viết: ${key}`);
    if (alias.skillId === skillId) {
      throw new BadRequestException('Cách viết này đã thuộc kỹ năng đó.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.skillAlias.update({
        where: { key },
        data: { skillId, source: 'MANUAL' },
      });
      const left = await tx.skillAlias.count({
        where: { skillId: alias.skillId },
      });
      if (left === 0)
        await tx.canonicalSkill.delete({ where: { id: alias.skillId } });
      return {
        key,
        from: alias.skillId,
        to: skillId,
        removedEmptySkill: left === 0,
      };
    });
  }

  /** Dồn mọi cách viết của `sourceId` sang `targetId` (đánh dấu MANUAL) rồi xoá `sourceId`. */
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('Không thể gộp một kỹ năng vào chính nó.');
    }
    await Promise.all([this.ensureSkill(sourceId), this.ensureSkill(targetId)]);

    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.skillAlias.updateMany({
        where: { skillId: sourceId },
        data: { skillId: targetId, source: 'MANUAL' },
      });
      await tx.canonicalSkill.delete({ where: { id: sourceId } });
      return { targetId, movedAliases: moved.count };
    });
  }

  /** Đối chiếu lại toàn kho theo danh bạ mới; chặng sau đó tự phát suất chấm AI trong hạn mức. */
  async rematchAll() {
    const queueJobId = await this.queue.send(QUEUE.REQUIREMENT_MATCH, {});
    return { queued: queueJobId !== null, queueJobId };
  }

  private async ensureSkill(id: string) {
    const found = await this.prisma.canonicalSkill.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`Không tìm thấy kỹ năng: ${id}`);
  }
}
