import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma, Profile } from '@/generated/prisma/client';
import { foldTerm } from '@/common/text/vietnamese';
import { PrismaService } from '@/prisma/prisma.service';
import { QUEUE, QueueService } from '../queue/queue.service';
import { ReferralsService } from '../referrals/referrals.service';
import { completionPercent } from './utils/completion';
import { occupationAfterSave } from './utils/occupation';
import { SUB_OCCUPATION_PARENT } from '@/modules/jobs/taxonomy/sub-occupations';
import { resolveProvince } from '@/modules/jobs/taxonomy/resolve';
import { REMOTE_CODE } from '@/modules/jobs/taxonomy/provinces';
import { OTHER_CODE } from '@/modules/jobs/taxonomy/occupations';
import type { QuickStartProfileDto } from './profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly referrals: ReferralsService,
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

  /** Ghi đủ ngành, các nghề trong ngành, nơi làm việc và kinh nghiệm; nghề phải thuộc đúng ngành gửi kèm. */
  async quickStart(
    userId: string,
    dto: QuickStartProfileDto,
  ): Promise<Profile> {
    const subOccupationCodes = Array.from(new Set(dto.subOccupationCodes));
    if (
      subOccupationCodes.some(
        (code) => SUB_OCCUPATION_PARENT[code] !== dto.occupationCode,
      )
    ) {
      throw new BadRequestException('Nghề đã chọn không thuộc nhóm ngành này');
    }
    return this.save(userId, {
      occupationCode: dto.occupationCode,
      subOccupationCodes,
      preferredProvinces: Array.from(new Set(dto.preferredProvinces)),
      experienceLevel: dto.experienceLevel,
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

    const occupationCode = occupationAfterSave(saved, data);
    const province =
      data.location !== undefined && !saved.preferredProvinces.length
        ? resolveProvince(saved.location)
        : null;
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        completion: completionPercent(saved),
        occupationCode,
        ...(occupationCode !== saved.occupationCode
          ? { subOccupationCodes: [] }
          : {}),
        ...(province && province !== REMOTE_CODE
          ? { preferredProvinces: [province] }
          : {}),
      },
    });

    if (profile.occupationCode && profile.occupationCode !== OTHER_CODE) {
      await this.referrals.rewardIfDue(userId);
    }
    await this.queue.send(QUEUE.SKILL_CANONICALIZE, { userId });
    return profile;
  }
}
