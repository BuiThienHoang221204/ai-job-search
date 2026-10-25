import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { appRole, runsBackgroundWork } from '@/config/app-role';
import { PrismaService } from '@/prisma/prisma.service';
import { messageOf } from '@/common/error-message';
import { PushService } from '@/modules/push/push.service';
import { reminderBody, reminderSlot } from '../utils/study-reminder';

const JOB_NAME = 'learning.study-reminder';
const SCHEDULE = '*/15 * * * *';

@Injectable()
export class StudyReminderService implements OnModuleInit {
  private readonly logger = new Logger(StudyReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!runsBackgroundWork()) {
      this.logger.log(`Vai ${appRole()}: không chạy cron nhắc học`);
      return;
    }
    if (!this.push.enabled) {
      this.logger.log(
        'Cron nhắc học TẮT: chưa đặt VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY',
      );
      return;
    }

    const job = new CronJob(SCHEDULE, () => void this.runOnce());
    this.registry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(`Cron nhắc học: "${SCHEDULE}"`);
  }

  private async runOnce(): Promise<void> {
    try {
      await this.remind(new Date());
    } catch (error) {
      this.logger.error(`Lượt nhắc học thất bại: ${messageOf(error)}`);
    }
  }

  /** Nhắc người có giờ học sau `now` 15 phút, hôm đó có kỹ năng đang học, chưa tắt nhắc học và có ít nhất một thiết bị nhận thông báo. */
  async remind(now: Date): Promise<number> {
    const { studyTime, day } = reminderSlot(now);
    const today = { status: 'LEARNING' as const, days: { has: day } };
    const users = await this.prisma.user.findMany({
      where: {
        studyTime,
        studyReminders: true,
        pushSubscriptions: { some: {} },
        learningItems: { some: today },
      },
      select: {
        learningItems: {
          where: today,
          orderBy: { createdAt: 'asc' },
          select: { skillName: true, steps: true },
        },
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
      },
    });

    let sent = 0;
    for (const user of users) {
      sent += await this.push.send(user.pushSubscriptions, {
        title: 'Careelot · Nhắc học',
        body: reminderBody(studyTime, user.learningItems),
        url: '/dashboard/upskill',
      });
    }
    if (users.length) {
      this.logger.log(
        `Nhắc học ${studyTime}: ${users.length} người, gửi được ${sent} thông báo`,
      );
    }
    return sent;
  }
}
