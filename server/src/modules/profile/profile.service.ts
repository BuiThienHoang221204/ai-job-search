import { Injectable } from '@nestjs/common';
import type { Prisma, Profile } from '@/generated/prisma/client';
import { foldTerm } from '@/common/text/vietnamese';
import { PrismaService } from '@/prisma/prisma.service';
import { QUEUE, QueueService } from '../queue/queue.service';
import { completionPercent } from './utils/completion';
import { occupationAfterSave } from './utils/occupation';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async get(userId: string): Promise<Profile> {
    return this.prisma.profile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async addSkill(userId: string, skill: string): Promise<Profile> {
    const profile = await this.get(userId);
    const wanted = foldTerm(skill);
    const known = [...profile.primarySkills, ...profile.secondarySkills];
    if (known.some((item) => foldTerm(item) === wanted)) return profile;
    return this.save(userId, {
      secondarySkills: [...profile.secondarySkills, skill.trim()],
    });
  }

  /** Đường GHI duy nhất: thiếu `completion` hay `occupationCode` là hồ sơ tàng hình. */
  async save(
    userId: string,
    data: Omit<Prisma.ProfileUncheckedCreateInput, 'userId'>,
  ): Promise<Profile> {
    const saved = await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        completion: completionPercent(saved),
        occupationCode: occupationAfterSave(saved, data),
      },
    });

    await this.queue.send(QUEUE.SKILL_CANONICALIZE, { userId });
    return profile;
  }
}
