import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SANDBOX,
  SandboxError,
  type SandboxRunner,
} from '@/modules/sandbox/sandbox.interface';
import {
  countPages,
  firstRenderError,
  sandboxReason,
  type PdfRenderer,
  type PdfRenderResult,
} from './seam';

export const PDF_IMAGE = process.env.PDF_IMAGE ?? 'aijob-pdf';

const RENDER_TIMEOUT_MS = 45_000;

const WORK = '/work';

const HTML_NAME = 'document.html';
const HTML_PDF_NAME = 'document.pdf';

const CHROMIUM_COMMAND = [
  'chromium',
  '--headless=new',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--host-resolver-rules=MAP * ~NOTFOUND',
  `--user-data-dir=${WORK}/profile`,
  '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=3000',
  '--no-pdf-header-footer',
  `--print-to-pdf=${WORK}/${HTML_PDF_NAME}`,
  `file://${WORK}/${HTML_NAME}`,
];

@Injectable()
export class SandboxPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger(SandboxPdfRenderer.name);

  constructor(@Inject(SANDBOX) private readonly sandbox: SandboxRunner) {}

  async render(html: string): Promise<PdfRenderResult> {
    try {
      const result = await this.sandbox.run({
        image: PDF_IMAGE,
        files: { [HTML_NAME]: html },
        command: CHROMIUM_COMMAND,
        timeoutMs: RENDER_TIMEOUT_MS,
        artifacts: [HTML_PDF_NAME],
        memoryMb: 1024,
      });

      const pdf = result.artifacts[HTML_PDF_NAME];

      if (!pdf || pdf.byteLength === 0) {
        const log = result.stderr || result.stdout;
        return { ok: false, reason: firstRenderError(log), log };
      }

      return { ok: true, pdf, pages: countPages(pdf) };
    } catch (error) {
      if (error instanceof SandboxError) {
        this.logger.error(`In PDF thất bại (${error.kind}): ${error.message}`);
        return {
          ok: false,
          reason: sandboxReason(error),
          log: error.message,
        };
      }
      throw error;
    }
  }
}
