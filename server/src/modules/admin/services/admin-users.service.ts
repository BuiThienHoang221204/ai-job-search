import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { UsersQueryDto } from '../admin.dto.js';
import { roleChangeBlocker, type Role } from '../utils/role-change.js';

const COUNTS = {
  _count: {
    select: {
      documents: true,
      matches: true,
      applications: true,
      aiCalls: true,
      scrapeRuns: true,
    },
  },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UsersQueryDto) {
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          profile: { select: { headline: true, completion: true } },
          ...COUNTS,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageOf(items, total, query);
  }

  /** Không trả hồ sơ đầy đủ: admin cần biết tài khoản dùng hệ thống ra sao, không cần đọc CV của họ. */
  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            headline: true,
            occupationCode: true,
            completion: true,
            primarySkills: true,
            updatedAt: true,
          },
        },
        ...COUNTS,
      },
    });
    if (!user) throw new NotFoundException(`Không tìm thấy người dùng: ${id}`);

    const [tokens, lastCall, recentCalls] = await Promise.all([
      this.prisma.aiCall.aggregate({
        where: { userId: id },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.aiCall.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.aiCall.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          purpose: true,
          modelId: true,
          ok: true,
          failureKind: true,
          durationMs: true,
          inputTokens: true,
          outputTokens: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      ...user,
      usage: {
        inputTokens: tokens._sum.inputTokens ?? 0,
        outputTokens: tokens._sum.outputTokens ?? 0,
        lastCallAt: lastCall?.createdAt ?? null,
      },
      recentCalls,
    };
  }

  async updateRole(actorId: string, targetId: string, nextRole: Role) {
    const [target, adminCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true },
      }),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
    ]);
    if (!target)
      throw new NotFoundException(`Không tìm thấy người dùng: ${targetId}`);

    const blocker = roleChangeBlocker({
      actorId,
      targetId,
      currentRole: target.role,
      nextRole,
      adminCount,
    });
    if (blocker) throw new BadRequestException(blocker);

    return this.prisma.user.update({
      where: { id: targetId },
      data: { role: nextRole },
      select: { id: true, email: true, name: true, role: true },
    });
  }
}
