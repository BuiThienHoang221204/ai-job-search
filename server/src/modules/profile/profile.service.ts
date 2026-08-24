import { Injectable } from '@nestjs/common';
import type { Profile } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import type { UpdateProfileDto } from './profile.dto.js';
import { completionPercent } from './completion.js';
import { profileOccupation } from './occupation.js';

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

  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const data = dto as Record<string, unknown>;
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
