import { Injectable, Logger } from '@nestjs/common';
import {
  firstTexError,
  missingGlyphs,
  type LatexCompiler,
  type LatexCompileResult,
} from '../latex-compile.js';

/**
 * ĐO ĐƯỢC trên dịch vụ thường trú: lượt đầu 3,6 giây, ổn định 2,6–3,1 giây. Nhanh
 * hơn `docker run` (5,1s) vì không khởi container mỗi lần.
 */
const REQUEST_TIMEOUT_MS = 70_000;

/** Ghép các dòng `Missing character` mà dịch vụ gửi qua header. */
const WARNING_SEPARATOR = ' | ';

/** Compile bằng cách gọi dịch vụ `latex-compile` qua HTTP. */
@Injectable()
export class HttpLatexCompiler implements LatexCompiler {
  private readonly logger = new Logger(HttpLatexCompiler.name);

  constructor(private readonly baseUrl: string) {}

  async available(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async compile(tex: string): Promise<LatexCompileResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: tex,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Không gọi được dịch vụ LaTeX: ${message}`);
      return {
        ok: false,
        reason:
          'Máy chủ chưa bật được môi trường tạo PDF. Đây là lỗi cấu hình phía hệ thống, không phải do tài liệu của bạn.',
        log: message,
      };
    }

    if (response.ok) {
      const pdf = Buffer.from(await response.arrayBuffer());

      if (pdf.byteLength === 0) {
        return {
          ok: false,
          reason: 'Dịch vụ tạo PDF trả về file rỗng.',
          log: '',
        };
      }

      return { ok: true, pdf, warnings: this.readWarnings(response) };
    }

    const log = await this.readLog(response);
    return { ok: false, reason: firstTexError(log), log };
  }

  /** Đọc cảnh báo ký tự font từ header. */
  private readWarnings(response: Response): string[] {
    const header = response.headers.get('x-latex-warnings-b64');
    if (!header) return [];

    let decoded: string;
    try {
      decoded = Buffer.from(header, 'base64').toString('utf8');
    } catch {
      this.logger.warn('Header cảnh báo LaTeX không giải mã được base64');
      return [];
    }

    return missingGlyphs(decoded.split(WARNING_SEPARATOR).join('\n'));
  }

  private async readLog(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as {
        log?: unknown;
        error?: unknown;
      };
      if (typeof body.log === 'string') return body.log;
      if (typeof body.error === 'string') return `! ${body.error}`;
      return '';
    } catch {
      return '';
    }
  }
}
