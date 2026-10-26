import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { voiceBonusUsed } from '@/modules/mock-interview/utils/voice-interview';
import { newReferralCode } from './referrals.utils';

const REFERRAL_REWARD_MINUTES = 15;
const MAX_REWARDED_REFERRALS = 10;

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mã mời, số người đã tham gia / đang chờ chọn ngành và phút thưởng còn lại; chưa có mã thì sinh. */
  async summary(userId: string) {
    const [code, joined, pending, bonusLeft] = await Promise.all([
      this.codeOf(userId),
      this.prisma.user.count({
        where: { referredById: userId, referralRewardedAt: { not: null } },
      }),
      this.prisma.user.count({
        where: { referredById: userId, referralRewardedAt: null },
      }),
      this.bonusLeft(userId),
    ]);
    return {
      code,
      joined,
      pending,
      bonusMinutesLeft: bonusLeft,
      rewardMinutes: REFERRAL_REWARD_MINUTES,
      maxRewarded: MAX_REWARDED_REFERRALS,
    };
  }

  /** Phút giọng nói được thưởng còn dùng được: tổng được thưởng trừ phần các buổi đã tiêu. */
  async bonusLeft(userId: string): Promise<number> {
    const [user, runs] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { bonusVoiceMinutes: true },
      }),
      this.prisma.agentRun.findMany({
        where: { userId, input: { path: ['bonus'], gt: 0 } },
        select: { status: true, startedAt: true, updatedAt: true, input: true },
      }),
    ]);
    const used = voiceBonusUsed(runs, new Date());
    return Math.max(0, Math.floor(user.bonusVoiceMinutes - used));
  }

  async referrerOf(code: string | undefined): Promise<string | null> {
    if (!code) return null;
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code.trim().toUpperCase() },
      select: { id: true },
    });
    return referrer?.id ?? null;
  }

  async rewardIfDue(userId: string): Promise<void> {
    const claimed = await this.prisma.user.updateMany({
      where: {
        id: userId,
        referredById: { not: null },
        referralRewardedAt: null,
      },
      data: {
        referralRewardedAt: new Date(),
        bonusVoiceMinutes: { increment: REFERRAL_REWARD_MINUTES },
      },
    });
    if (!claimed.count) return;

    const { referredById } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { referredById: true },
    });
    if (!referredById) return;
    const rewarded = await this.prisma.user.count({
      where: { referredById, referralRewardedAt: { not: null } },
    });
    if (rewarded > MAX_REWARDED_REFERRALS) return;
    await this.prisma.user.update({
      where: { id: referredById },
      data: { bonusVoiceMinutes: { increment: REFERRAL_REWARD_MINUTES } },
    });
  }

  private async codeOf(userId: string): Promise<string> {
    for (;;) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (user.referralCode) return user.referralCode;

      try {
        await this.prisma.user.updateMany({
          where: { id: userId, referralCode: null },
          data: { referralCode: newReferralCode() },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }
}
