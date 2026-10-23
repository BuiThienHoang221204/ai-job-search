import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import type { PushSubscription } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { messageOf } from '@/common/error-message';
import type { SubscribePushDto } from './push.dto';

type PushMessage = { title: string; body: string; url: string };

type PushConfig = {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
};

type Target = Pick<PushSubscription, 'id' | 'endpoint' | 'p256dh' | 'auth'>;

const TTL_SECONDS = 30 * 60;

const TEST_MESSAGE: PushMessage = {
  title: 'Careelot · Nhắc học',
  body: 'Thiết bị này đã nhận được nhắc học.',
  url: '/dashboard/upskill',
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string;
  readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const push = config.get<PushConfig>('push')!;
    this.publicKey = push.vapidPublicKey;
    this.enabled = push.vapidPublicKey !== '' && push.vapidPrivateKey !== '';
    if (this.enabled) {
      webpush.setVapidDetails(
        push.vapidSubject,
        push.vapidPublicKey,
        push.vapidPrivateKey,
      );
    }
  }

  publicKeyOf(): { publicKey: string } {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Máy chủ chưa bật thông báo đẩy');
    }
    return { publicKey: this.publicKey };
  }

  /** Lưu thiết bị theo `endpoint`; cùng trình duyệt đăng nhập tài khoản khác thì thiết bị chuyển sang tài khoản đó. */
  async subscribe(userId: string, dto: SubscribePushDto) {
    const keys = { p256dh: dto.keys.p256dh, auth: dto.keys.auth };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, ...keys },
      update: { userId, ...keys },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { removed: count };
  }

  async sendTest(userId: string, endpoint: string) {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Máy chủ chưa bật thông báo đẩy');
    }
    const target = await this.prisma.pushSubscription.findFirst({
      where: { userId, endpoint },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (!target) {
      throw new NotFoundException('Thiết bị này chưa bật nhắc học');
    }
    return { sent: await this.send([target], TEST_MESSAGE) };
  }

  /** Gửi tới từng thiết bị, trả số lần gửi được; thiết bị dịch vụ push báo đã huỷ (404/410) thì xoá luôn. */
  async send(targets: Target[], message: PushMessage): Promise<number> {
    let sent = 0;
    for (const target of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify(message),
          { TTL: TTL_SECONDS },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription.deleteMany({
            where: { id: target.id },
          });
          continue;
        }
        this.logger.warn(
          `Gửi thông báo đẩy hỏng (${status ?? 'mạng'}): ${messageOf(error)}`,
        );
      }
    }
    return sent;
  }
}
