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
} from './seam';
import { messageOf } from '@/common/error-message';

const LATEX_TIMEOUT_MS = 70_000;

const RENDER_TIMEOUT_MS = 30_000;

const WARNING_SEPARATOR = ' | ';

type ServiceCall = {
  baseUrl: string;
  path: string;
  contentType: string;
  body: string;
  timeoutMs: number;
  logger: Logger;
  label: string;
  firstError: (log: string) => string;
};

type ServiceResult = { pdf: Buffer; response: Response } | PdfFailure;

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

/** Gửi nội dung sang dịch vụ PDF rồi phân loại phản hồi — dùng chung cho hai adapter. */
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
    const message = messageOf(error);
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

  private readWarnings(response: Response): string[] {
    const header = response.headers.get('x-latex-warnings-b64');
    if (!header) return [];

    const decoded = Buffer.from(header, 'base64').toString('utf8');
    return missingGlyphs(decoded.split(WARNING_SEPARATOR).join('\n'));
  }
}

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

function readPages(response: Response): number {
  const header = response.headers.get('x-pdf-pages');
  if (!header) return 0;

  const pages = Number.parseInt(header, 10);
  return Number.isFinite(pages) && pages > 0 ? pages : 0;
}
