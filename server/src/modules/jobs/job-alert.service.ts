import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { appRole, runsBackgroundWork } from '@/config/app-role';
import { daysAgo, HOUR_MS } from '@/common/duration';
import { messageOf } from '@/common/error-message';
import { PrismaService } from '@/prisma/prisma.service';
import { PushService } from '@/modules/push/push.service';
import {
  followedAlertText,
  jobAlertBody,
  jobAlertUrl,
  vnDayStart,
} from './utils/job-alert';
import { needsOccupation, profileFit } from './utils/occupation-gate';
import { orderFor, whereFrom } from './utils/job-view';

const JOB_NAME = 'jobs.morning-alert';
const ALERT_TTL_SECONDS = (12 * HOUR_MS) / 1000;

@Injectable()
export class JobAlertService implements OnModuleInit {
  private readonly logger = new Logger(JobAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly registry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!runsBackgroundWork()) {
      this.logger.log(`Vai ${appRole()}: không chạy cron báo tin mới`);
      return;
    }
    if (!this.push.enabled) {
      this.logger.log(
        'Cron báo tin mới TẮT: chưa đặt VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY',
      );
      return;
    }

    const schedule = this.config.get<string>('cron.jobAlertSchedule')!;
    const timeZone = this.config.get<string>('cron.timezone')!;
    const job = new CronJob(
      schedule,
      () => void this.runOnce(),
      null,
      false,
      timeZone,
    );
    this.registry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(`Cron báo tin mới: "${schedule}" theo giờ ${timeZone}`);
  }

  private async runOnce(): Promise<void> {
    try {
      await this.alert(new Date());
    } catch (error) {
      this.logger.error(`Lượt báo tin mới thất bại: ${messageOf(error)}`);
    }
  }

  /** Báo tin mới của "Việc làm phù hợp" và của công ty đang theo dõi cho người đã bật, mỗi người tối đa một lần một ngày; không có tin mới thì không gửi. */
  async alert(now: Date): Promise<number> {
    const due = {
      jobNotifications: true,
      OR: [
        { jobAlertSentAt: null },
        { jobAlertSentAt: { lt: vnDayStart(now) } },
      ],
    };
    const users = await this.prisma.user.findMany({
      where: { ...due, pushSubscriptions: { some: {} } },
      select: {
        id: true,
        jobAlertSentAt: true,
        profile: {
          select: {
            occupationCode: true,
            subOccupationCodes: true,
            preferredProvinces: true,
            experienceLevel: true,
            experiences: true,
          },
        },
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
        companyFollows: { select: { companyKey: true, name: true } },
      },
    });

    let sent = 0;
    for (const user of users) {
      const claimed = await this.prisma.user.updateMany({
        where: { id: user.id, ...due },
        data: { jobAlertSentAt: now },
      });
      if (claimed.count === 0) continue;

      const since = user.jobAlertSentAt ?? daysAgo(1, now.getTime());
      const fit = profileFit(user.profile);
      const lines: string[] = [];
      let url: string | null = null;

      if (!needsOccupation(fit)) {
        const query = { scored: true, since: since.toISOString() };
        const where = whereFrom(query, user.id, fit);
        const [total, newest] = await Promise.all([
          this.prisma.job.count({ where }),
          this.prisma.job.findMany({
            where,
            orderBy: orderFor('newest'),
            take: 2,
            select: { title: true, company: true },
          }),
        ]);
        if (total) {
          lines.push(jobAlertBody(total, newest));
          url = jobAlertUrl('scored', since);
        }
      }

      if (user.companyFollows.length) {
        const names = new Map(
          user.companyFollows.map((follow) => [follow.companyKey, follow.name]),
        );
        const groups = await this.prisma.job.groupBy({
          by: ['companyKey'],
          where: {
            duplicateOfId: null,
            companyKey: { in: [...names.keys()] },
            scrapedAt: { gte: since },
          },
          _count: { _all: true },
          orderBy: { _count: { companyKey: 'desc' } },
        });
        if (groups.length) {
          const companies = groups.map((group) => ({
            name: names.get(group.companyKey ?? '') ?? '',
            count: group._count._all,
          }));
          lines.push(followedAlertText(companies));
          url ??= jobAlertUrl('followed', since);
        }
      }
      if (!url) continue;

      sent += await this.push.send(
        user.pushSubscriptions,
        { title: 'Careelot · Việc làm mới', body: lines.join(' '), url },
        ALERT_TTL_SECONDS,
      );
    }
    if (users.length) {
      this.logger.log(
        `Báo tin mới: ${users.length} người đến lượt, gửi được ${sent} thông báo`,
      );
    }
    return sent;
  }
}
