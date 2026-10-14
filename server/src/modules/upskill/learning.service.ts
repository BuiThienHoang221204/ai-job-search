import { BadRequestException, Injectable } from '@nestjs/common';
import type { LearningStatus } from '@/generated/prisma/enums';
import { PrismaService } from '@/prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { SkillGapService } from './skill-gap.service';
import type { SaveLearningDto } from './upskill.dto';

export const MAX_LEARNING = 3;

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gaps: SkillGapService,
    private readonly profile: ProfileService,
  ) {}

  async overview(userId: string) {
    const [report, items] = await Promise.all([
      this.gaps.forUser(userId),
      this.prisma.learningItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const statusOf = new Map(items.map((item) => [item.skillKey, item.status]));

    return {
      ...report,
      gaps: report.gaps.map((gap) => ({
        ...gap,
        status: statusOf.get(gap.key) ?? 'OPEN',
      })),
      plan: items.filter((item) => item.status !== 'SKIPPED'),
      skipped: items.filter((item) => item.status === 'SKIPPED'),
    };
  }

  /** Ghi lựa chọn cho một kỹ năng; đủ 3 mốc thì thành DONE và kỹ năng được thêm vào hồ sơ. */
  async save(userId: string, skillKey: string, dto: SaveLearningDto) {
    if (dto.status === 'LEARNING') {
      const learning = await this.prisma.learningItem.count({
        where: { userId, status: 'LEARNING', NOT: { skillKey } },
      });
      if (learning >= MAX_LEARNING) {
        throw new BadRequestException(
          `Kế hoạch đã đủ ${MAX_LEARNING} kỹ năng. Hoàn thành hoặc bỏ bớt một kỹ năng trước.`,
        );
      }
    }

    const finished = dto.status === 'LEARNING' && dto.steps?.every(Boolean);
    const status: LearningStatus = finished ? 'DONE' : dto.status;
    const data = {
      skillName: dto.skillName,
      status,
      ...(dto.steps ? { steps: dto.steps } : {}),
      ...(dto.days ? { days: dto.days } : {}),
    };

    const item = await this.prisma.learningItem.upsert({
      where: { userId_skillKey: { userId, skillKey } },
      create: { userId, skillKey, ...data },
      update: data,
    });

    if (status === 'DONE') await this.profile.addSkill(userId, dto.skillName);
    return item;
  }

  async remove(userId: string, skillKey: string) {
    const { count } = await this.prisma.learningItem.deleteMany({
      where: { userId, skillKey },
    });
    return { removed: count };
  }
}
