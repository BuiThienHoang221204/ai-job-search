import { Injectable, Logger } from '@nestjs/common';
import {
  firstRenderError,
  firstTexError,
  missingGlyphs,
  PDF_UNAVAILABLE,
  type LatexCompiler,
  type LatexCompileResult,
  type PdfFailure,
  type PdfRenderer,
  type PdfRenderResult,
} from './seam.js';

/** Đo trên dịch vụ thường trú: lượt đầu 3,6 giây, ổn định 2,6–3,1 giây — nhanh hơn `docker run` (5,1s). */
const LATEX_TIMEOUT_MS = 70_000;

/** Đo 0,61–0,70 giây một bản in; 30 giây cố ý DÀI HƠN timeout 25s phía dịch vụ để app luôn nhận được log. */
const RENDER_TIMEOUT_MS = 30_000;

/** Ghép các dòng `Missing character` mà dịch vụ gửi qua header. */
const WARNING_SEPARATOR = ' | ';

type ServiceCall = {
  baseUrl: string;
  path: string;
  contentType: string;
  body: string;
  timeoutMs: number;
  logger: Logger;
  /** Đưa vào câu log khi không gọi được dịch vụ, ví dụ `LaTeX`. */
  label: string;
  /** Đổi log của dịch vụ thành một câu cho người dùng. */
  firstError: (log: string) => string;
};

/** PDF về được, hoặc một `PdfFailure` đã dựng sẵn câu cho người dùng. */
type ServiceResult = { pdf: Buffer; response: Response } | PdfFailure;

/** Health check chung: dịch vụ có trả lời `/health` không. */
async function serviceAvailable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Log lỗi trong thân phản hồi JSON của cả hai dịch vụ. */
async function readLog(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { log?: unknown; error?: unknown };
    if (typeof body.log === 'string') return body.log;
    if (typeof body.error === 'string') return `! ${body.error}`;
    return '';
  } catch {
    return '';
  }
}

/** Gửi nội dung sang dịch vụ rồi phân loại phản hồi — phần giống nhau của hai adapter. */
async function postToService(call: ServiceCall): Promise<ServiceResult> {
  let response: Response;
  try {
    response = await fetch(`${call.baseUrl}${call.path}`, {
      method: 'POST',
      headers: { 'Content-Type': call.contentType },
      body: call.body,
      signal: AbortSignal.timeout(call.timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    call.logger.error(`Không gọi được dịch vụ ${call.label}: ${message}`);
    return { ok: false, reason: PDF_UNAVAILABLE, log: message };
  }

  if (!response.ok) {
    const log = await readLog(response);
    return { ok: false, reason: call.firstError(log), log };
  }

  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.byteLength === 0) {
    return { ok: false, reason: 'Dịch vụ tạo PDF trả về file rỗng.', log: '' };
  }

  return { pdf, response };
}

/** Compile bằng cách gọi dịch vụ `latex-service` qua HTTP. */
@Injectable()
export class HttpLatexCompiler implements LatexCompiler {
  private readonly logger = new Logger(HttpLatexCompiler.name);

  constructor(private readonly baseUrl: string) {}

  available(): Promise<boolean> {
    return serviceAvailable(this.baseUrl);
  }

  async compile(tex: string): Promise<LatexCompileResult> {
    const result = await postToService({
      baseUrl: this.baseUrl,
      path: '/compile',
      contentType: 'text/plain; charset=utf-8',
      body: tex,
      timeoutMs: LATEX_TIMEOUT_MS,
      logger: this.logger,
      label: 'LaTeX',
      firstError: firstTexError,
    });

    if ('ok' in result) return result;

    return {
      ok: true,
      pdf: result.pdf,
      warnings: this.readWarnings(result.response),
    };
  }

  /** Cảnh báo ký tự font đi qua HEADER nên phải base64: header HTTP chỉ nhận ISO-8859-1. */
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
}

/** In bằng cách gọi dịch vụ `pdf-service` qua HTTP. */
@Injectable()
export class HttpPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger(HttpPdfRenderer.name);

  constructor(private readonly baseUrl: string) {}

  available(): Promise<boolean> {
    return serviceAvailable(this.baseUrl);
  }

  async render(html: string): Promise<PdfRenderResult> {
    const result = await postToService({
      baseUrl: this.baseUrl,
      path: '/render',
      contentType: 'text/html; charset=utf-8',
      body: html,
      timeoutMs: RENDER_TIMEOUT_MS,
      logger: this.logger,
      label: 'in PDF',
      firstError: firstRenderError,
    });

    if ('ok' in result) return result;

    return { ok: true, pdf: result.pdf, pages: readPages(result.response) };
  }
}

/** Số trang từ header. Trả 0 nghĩa là "không biết", chỗ gọi bỏ qua phép kiểm. */
function readPages(response: Response): number {
  const header = response.headers.get('x-pdf-pages');
  if (!header) return 0;

  const pages = Number.parseInt(header, 10);
  return Number.isFinite(pages) && pages > 0 ? pages : 0;
}
