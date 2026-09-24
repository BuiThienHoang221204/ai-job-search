import { Injectable } from '@nestjs/common';
import type { Profile } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import type { UpdateProfileDto } from './profile.dto.js';
import { completionPercent } from './utils/completion.js';
import { profileOccupation } from './utils/occupation.js';

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

  update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    return this.save(userId, dto as Record<string, unknown>);
  }

  /** Đường GHI duy nhất: thiếu `completion` hay `occupationCode` là hồ sơ tàng hình. */
  async save(userId: string, data: Record<string, unknown>): Promise<Profile> {
    const saved = await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        completion: completionPercent(saved),
        occupationCode: profileOccupation(saved),
      },
    });

    await this.queue.send(QUEUE.SKILL_CANONICALIZE, { userId });
    return profile;
  }
}
