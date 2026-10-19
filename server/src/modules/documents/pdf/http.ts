import { Logger } from '@nestjs/common';
import {
  firstRenderError,
  PDF_UNAVAILABLE,
  type PdfRenderer,
  type PdfRenderResult,
} from './seam';
import { messageOf } from '@/common/error-message';

const RENDER_TIMEOUT_MS = 30_000;

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

function readPages(response: Response): number {
  const header = response.headers.get('x-pdf-pages');
  if (!header) return 0;

  const pages = Number.parseInt(header, 10);
  return Number.isFinite(pages) && pages > 0 ? pages : 0;
}

export class HttpPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger(HttpPdfRenderer.name);

  constructor(private readonly baseUrl: string) {}

  async render(html: string): Promise<PdfRenderResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: html,
        signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
      });
    } catch (error) {
      const message = messageOf(error);
      this.logger.error(`Không gọi được dịch vụ in PDF: ${message}`);
      return { ok: false, reason: PDF_UNAVAILABLE, log: message };
    }

    if (!response.ok) {
      const log = await readLog(response);
      return { ok: false, reason: firstRenderError(log), log };
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.byteLength === 0) {
      return {
        ok: false,
        reason: 'Dịch vụ tạo PDF trả về file rỗng.',
        log: '',
      };
    }

    return { ok: true, pdf, pages: readPages(response) };
  }
}
