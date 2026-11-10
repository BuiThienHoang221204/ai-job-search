import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export type CodePurpose = 'signup' | 'login';

export const newCode = (): string =>
  String(randomInt(0, 1_000_000)).padStart(6, '0');

export const hashCode = (secret: string, email: string, code: string): string =>
  createHmac('sha256', secret)
    .update(`email-code:${email}:${code}`)
    .digest('hex');

export const secondsUntilResend = (
  sentAt: Date | undefined,
  waitMs: number,
): number => {
  if (!sentAt) return 0;
  const left = sentAt.getTime() + waitMs - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
};

export const sameHash = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function codeMail(
  code: string,
  purpose: CodePurpose,
  ttlMinutes: number,
  webUrl: string,
  supportEmail: string,
) {
  const subject = `${code} là mã xác minh Careelot của bạn`;
  let lead =
    'Nhập mã dưới đây vào trang đăng ký Careelot để hoàn tất tạo tài khoản.';
  let ignore =
    'Không phải bạn đăng ký? Cứ bỏ qua thư này, sẽ không có tài khoản nào được tạo.';
  if (purpose === 'login') {
    lead =
      'Nhập mã dưới đây vào trang đăng nhập Careelot để xác minh email và tiếp tục.';
    ignore =
      'Không phải bạn đăng nhập? Hãy đổi mật khẩu Careelot vì có người đã biết mật khẩu của bạn.';
  }
  const expiry = `Mã có hiệu lực trong ${ttlMinutes} phút và chỉ dùng được một lần. Đừng chia sẻ mã này cho ai, kể cả người tự nhận là nhân viên Careelot.`;
  const text = [
    'Mã xác minh email của bạn',
    '',
    lead,
    '',
    code,
    '',
    expiry,
    ignore,
    '',
    'Đội ngũ Careelot',
    `Cần hỗ trợ: ${supportEmail}`,
  ].join('\n');
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F4F4F6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Mã có hiệu lực ${ttlMinutes} phút. ${ignore}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F4F6" style="background:#F4F4F6">
<tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:560px;background:#FFFFFF;border:1px solid #ECECF0;border-radius:16px">
<tr><td style="padding:40px 40px 32px;font-family:${FONT};color:#1D1D20">
<img src="${webUrl}/email/careelot-logo.png" width="104" height="26" alt="Careelot" style="display:block;border:0;margin:0 0 32px">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700;color:#1D1D20">Mã xác minh email của bạn</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3F3F46">${lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#F7F7FA" style="background:#F7F7FA;border:1px solid #ECECF0;border-radius:12px;padding:18px 0;font-family:Menlo,Consolas,monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:10px;color:#1D1D20">${code}</td></tr></table>
<p style="margin:16px 0 0;font-size:12.5px;line-height:1.55;color:#71717A">${expiry}</p>
<p style="margin:12px 0 0;font-size:12.5px;line-height:1.55;color:#71717A">${ignore}</p>
<p style="margin:22px 0 0;font-size:14px;color:#3F3F46">Đội ngũ Careelot</p>
</td></tr></table>
<p style="max-width:560px;margin:18px auto 0;font-family:${FONT};font-size:12px;line-height:1.7;color:#A1A1AA">Careelot · Trợ lý tìm việc bằng AI · TP Hồ Chí Minh<br>Thư gửi tự động. Cần hỗ trợ: <a href="mailto:${supportEmail}" style="color:#71717A">${supportEmail}</a> · <a href="${webUrl}/dashboard/chinh-sach-bao-mat" style="color:#71717A">Chính sách bảo mật</a></p>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}
