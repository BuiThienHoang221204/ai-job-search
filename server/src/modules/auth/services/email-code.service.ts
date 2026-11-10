import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MINUTE_MS } from '@/common/duration';
import { PrismaService } from '@/prisma/prisma.service';
import {
  codeMail,
  hashCode,
  newCode,
  sameHash,
  secondsUntilResend,
  type CodePurpose,
} from '../email-code.utils';
import { MailService } from './mail.service';

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = MINUTE_MS;

const EXPIRED = {
  message:
    'Mã này đã hết hạn hoặc bị nhập sai quá 5 lần nên không dùng được nữa. Gửi mã mới để tiếp tục.',
  reason: 'CODE_EXPIRED',
};

type SignupData = { name: string; passwordHash: string; ref?: string };

type PendingCode = {
  name: string | null;
  passwordHash: string | null;
  ref: string | null;
};

@Injectable()
export class EmailCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Gửi mã cho đăng ký đang chờ hoặc cho tài khoản cũ cần xác minh; trong 60 giây sau lần gửi trước thì chỉ cập nhật dữ liệu đăng ký, không gửi thêm thư. */
  async start(email: string, signup: SignupData | null): Promise<void> {
    const data = {
      name: signup?.name ?? null,
      passwordHash: signup?.passwordHash ?? null,
      ref: signup?.ref ?? null,
    };
    const current = await this.prisma.emailCode.findUnique({
      where: { email },
      select: { sentAt: true },
    });
    if (secondsUntilResend(current?.sentAt, RESEND_AFTER_MS) > 0) {
      await this.prisma.emailCode.updateMany({ where: { email }, data });
      return;
    }
    await this.send(email, data);
  }

  async resend(email: string): Promise<void> {
    const pending = await this.prisma.emailCode.findUnique({
      where: { email },
      select: { name: true, passwordHash: true, ref: true, sentAt: true },
    });
    if (!pending) {
      throw new BadRequestException(
        'Phiên xác minh đã hết hạn. Hãy điền lại thông tin để nhận mã mới.',
      );
    }
    const wait = secondsUntilResend(pending.sentAt, RESEND_AFTER_MS);
    if (wait > 0) {
      throw new BadRequestException(
        `Mã vừa được gửi. Đợi ${wait} giây rồi gửi lại.`,
      );
    }
    await this.send(email, {
      name: pending.name,
      passwordHash: pending.passwordHash,
      ref: pending.ref,
    });
  }

  async consume(email: string, code: string): Promise<PendingCode> {
    const row = await this.prisma.emailCode.findUnique({ where: { email } });
    if (!row || row.expiresAt <= new Date() || row.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException(EXPIRED);
    }

    const secret = this.config.get<string>('auth.jwtSecret')!;
    if (!sameHash(hashCode(secret, email, code), row.codeHash)) {
      const bumped = await this.prisma.emailCode.updateMany({
        where: {
          email,
          codeHash: row.codeHash,
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      const left = MAX_ATTEMPTS - row.attempts - 1;
      if (bumped.count === 0 || left <= 0) {
        throw new BadRequestException(EXPIRED);
      }
      throw new BadRequestException(`Mã không đúng. Bạn còn ${left} lần thử.`);
    }

    const claimed = await this.prisma.emailCode.deleteMany({
      where: {
        email,
        codeHash: row.codeHash,
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
    });
    if (claimed.count === 0) throw new BadRequestException(EXPIRED);
    return { name: row.name, passwordHash: row.passwordHash, ref: row.ref };
  }

  private async send(email: string, data: PendingCode): Promise<void> {
    const code = newCode();
    const secret = this.config.get<string>('auth.jwtSecret')!;
    const fields = {
      ...data,
      codeHash: hashCode(secret, email, code),
      expiresAt: new Date(Date.now() + TTL_MINUTES * MINUTE_MS),
      sentAt: new Date(),
      attempts: 0,
    };
    await this.prisma.emailCode.upsert({
      where: { email },
      create: { email, ...fields },
      update: fields,
    });

    const purpose: CodePurpose = data.passwordHash ? 'signup' : 'login';
    try {
      await this.mail.send({
        to: email,
        ...codeMail(
          code,
          purpose,
          TTL_MINUTES,
          this.config.get<string>('mail.webUrl')!,
          this.config.get<string>('mail.replyTo')!,
        ),
      });
    } catch (error) {
      await this.prisma.emailCode.updateMany({
        where: { email },
        data: { sentAt: new Date(0) },
      });
      throw error;
    }
  }
}
