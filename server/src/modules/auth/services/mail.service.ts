import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type Mail = { to: string; subject: string; html: string; text: string };

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo: string;
  private readonly production: boolean;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('mail.resendApiKey')!;
    this.from = config.get<string>('mail.from')!;
    this.replyTo = config.get<string>('mail.replyTo')!;
    this.production = config.get<string>('nodeEnv') === 'production';
  }

  async send(mail: Mail): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(
        `Chưa cấu hình RESEND_API_KEY, bỏ qua mail tới ${mail.to}`,
      );
      if (!this.production) this.logger.log(mail.text);
      return;
    }

    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        reply_to: this.replyTo,
        ...mail,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Resend trả ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
  }
}
