import type { Mail } from '../modules/auth/services/mail.service';

export class FakeMail {
  readonly sent: Mail[] = [];
  failNext = false;

  send(mail: Mail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('Resend trả 500'));
    }
    this.sent.push(mail);
    return Promise.resolve();
  }

  codeFor(to: string): string {
    const mail = this.sent.filter((m) => m.to === to).at(-1);
    const code = mail?.subject.match(/^\d{6}/)?.[0];
    if (!code) throw new Error(`Không có thư chứa mã nào tới ${to}`);
    return code;
  }

  reset(): void {
    this.sent.length = 0;
    this.failNext = false;
  }
}
