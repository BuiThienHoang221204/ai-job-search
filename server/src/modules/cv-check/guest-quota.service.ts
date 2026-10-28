import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';

const TOTAL_SCOPE = 'cv-check-total';

const TOTAL_KEY = 'all';

const GUEST_SCOPE = 'cv-check-guest';

export type QuotaClaim =
  | { granted: true; remaining: number }
  | { granted: false; reason: 'guest-limit' | 'daily-limit' };

@Injectable()
export class GuestQuotaService {
  private readonly perGuest: number;
  private readonly perDay: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.perGuest = config.get<number>('cvCheck.aiPerGuestPerDay')!;
    this.perDay = config.get<number>('cvCheck.aiPerDay')!;
  }

  async claim(guestKey: string, day: string): Promise<QuotaClaim> {
    if ((await this.bump(TOTAL_SCOPE, TOTAL_KEY, day, this.perDay)) === null) {
      return { granted: false, reason: 'daily-limit' };
    }
    const used = await this.bump(GUEST_SCOPE, guestKey, day, this.perGuest);
    if (used === null) {
      await this.release(TOTAL_SCOPE, TOTAL_KEY, day);
      return { granted: false, reason: 'guest-limit' };
    }
    return { granted: true, remaining: this.perGuest - used };
  }

  async refund(guestKey: string, day: string): Promise<void> {
    await this.release(TOTAL_SCOPE, TOTAL_KEY, day);
    await this.release(GUEST_SCOPE, guestKey, day);
  }

  private async bump(
    scope: string,
    key: string,
    day: string,
    limit: number,
  ): Promise<number | null> {
    if (limit <= 0) return null;
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO usage_counters (scope, key, day, count, "updatedAt")
      VALUES (${scope}, ${key}, ${day}::date, 1, now())
      ON CONFLICT (scope, key, day) DO UPDATE
        SET count = usage_counters.count + 1, "updatedAt" = now()
        WHERE usage_counters.count < ${limit}
      RETURNING count`;
    return rows[0]?.count ?? null;
  }

  private release(scope: string, key: string, day: string) {
    return this.prisma.usageCounter.updateMany({
      where: { scope, key, day: new Date(day), count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }
}
