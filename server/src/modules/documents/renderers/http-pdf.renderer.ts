import { Injectable, Logger } from '@nestjs/common';
import {
  firstRenderError,
  type PdfRenderer,
  type PdfRenderResult,
} from '../pdf-render.js';

/**
 * Đo được 0,61-0,70 giây một bản in. 30 giây là biên rộng, và cố ý DÀI HƠN timeout
 * 25 giây phía dịch vụ để app luôn nhận được câu trả lời có log.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** In bằng cách gọi dịch vụ `pdf-service` qua HTTP. */
@Injectable()
export class HttpPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger(HttpPdfRenderer.name);

  constructor(private readonly baseUrl: string) {}

  /** Dịch vụ có phản hồi `/health` hay không. */
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

  /** POST HTML tới `/render`, nhận PDF hoặc lý do hỏng. */
  async render(html: string): Promise<PdfRenderResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Không gọi được dịch vụ in PDF: ${message}`);
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

      return { ok: true, pdf, pages: this.readPages(response) };
    }

    const log = await this.readLog(response);
    return { ok: false, reason: firstRenderError(log), log };
  }

  /** Số trang từ header. Trả 0 nghĩa là "không biết", chỗ gọi bỏ qua phép kiểm. */
  private readPages(response: Response): number {
    const header = response.headers.get('x-pdf-pages');
    if (!header) return 0;

    const pages = Number.parseInt(header, 10);
    return Number.isFinite(pages) && pages > 0 ? pages : 0;
  }

  /** Log lỗi trong thân phản hồi JSON. */
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
