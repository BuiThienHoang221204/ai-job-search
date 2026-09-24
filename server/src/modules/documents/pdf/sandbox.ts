import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SANDBOX,
  SandboxError,
  type SandboxRunner,
} from '../../sandbox/sandbox.interface.js';
import {
  countPages,
  firstRenderError,
  firstTexError,
  missingGlyphs,
  sandboxReason,
  type LatexCompiler,
  type LatexCompileResult,
  type PdfRenderer,
  type PdfRenderResult,
} from './seam.js';

/** Ảnh TeX Live, **8,92GB**. `DockerSandbox` đặt `--pull never` nên thiếu ảnh báo lỗi rõ thay vì tải giữa request. */
export const LATEX_IMAGE = process.env.LATEX_IMAGE ?? 'aijob-latex';

/** Ảnh Chromium. `DockerSandbox` đặt `--pull never` nên phải build trước. */
export const PDF_IMAGE = process.env.PDF_IMAGE ?? 'aijob-pdf';

/** Đo qua `docker run` kể cả thời gian khởi container: 4,6–5,1 giây; 60s là biên rộng gấp mười. */
const COMPILE_TIMEOUT_MS = 60_000;

/** Qua `docker run` thì phần lớn thời gian là khởi container chứ không phải in. */
const RENDER_TIMEOUT_MS = 45_000;

const TEX_NAME = 'main.tex';
const TEX_PDF_NAME = 'main.pdf';
const LOG_NAME = 'main.log';

/** Thư mục làm việc bên trong container, do `DockerSandbox` quy định. */
const WORK = '/work';

const HTML_NAME = 'document.html';
const HTML_PDF_NAME = 'document.pdf';

/** PHẢI khớp `chromium_argv` trong `pdf-service/server.py` — bản kia mới là bản chạy thật; test canh hai cờ an toàn. */
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

/** Compile bằng cách chạy `docker run` qua SEAM 2. Dùng cho máy phát triển. */
@Injectable()
export class SandboxLatexCompiler implements LatexCompiler {
  private readonly logger = new Logger(SandboxLatexCompiler.name);

  constructor(@Inject(SANDBOX) private readonly sandbox: SandboxRunner) {}

  available(): Promise<boolean> {
    return this.sandbox.available();
  }

  /** MỘT lượt chạy là đủ — đã kiểm: template không có mục lục lẫn tham chiếu chéo nên không cần lượt hai. */
  async compile(tex: string): Promise<LatexCompileResult> {
    try {
      const result = await this.sandbox.run({
        image: LATEX_IMAGE,
        files: { [TEX_NAME]: tex },
        command: [
          'lualatex',
          '-no-shell-escape',
          '-interaction=nonstopmode',
          TEX_NAME,
        ],
        timeoutMs: COMPILE_TIMEOUT_MS,
        artifacts: [TEX_PDF_NAME, LOG_NAME],
      });

      const log = result.artifacts[LOG_NAME]?.toString() ?? result.stdout;
      const pdf = result.artifacts[TEX_PDF_NAME];

      // Exit code 0 KHÔNG có nghĩa là xong: `nonstopmode` bỏ qua lỗi rồi vẫn thoát 0.
      if (!pdf || pdf.byteLength === 0) {
        return { ok: false, reason: firstTexError(log), log };
      }

      return { ok: true, pdf, warnings: missingGlyphs(log) };
    } catch (error) {
      if (error instanceof SandboxError) {
        this.logger.error(
          `Compile PDF thất bại (${error.kind}): ${error.message}`,
        );
        return {
          ok: false,
          reason: sandboxReason(
            error,
            'Máy chủ chưa có bộ công cụ LaTeX. Người vận hành cần tải ảnh TeX Live trước.',
          ),
          log: error.message,
        };
      }
      throw error;
    }
  }
}

/** In bằng cách chạy `docker run` qua SEAM 2. Dùng cho máy phát triển. */
@Injectable()
export class SandboxPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger(SandboxPdfRenderer.name);

  constructor(@Inject(SANDBOX) private readonly sandbox: SandboxRunner) {}

  available(): Promise<boolean> {
    return this.sandbox.available();
  }

  /** Ghi HTML vào container, chạy Chromium, lấy PDF ra. */
  async render(html: string): Promise<PdfRenderResult> {
    try {
      const result = await this.sandbox.run({
        image: PDF_IMAGE,
        files: { [HTML_NAME]: html },
        command: CHROMIUM_COMMAND,
        timeoutMs: RENDER_TIMEOUT_MS,
        artifacts: [HTML_PDF_NAME],
        limits: { memoryMb: 1024 },
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
          reason: sandboxReason(
            error,
            'Máy chủ chưa có bộ công cụ in PDF. Người vận hành cần build ảnh aijob-pdf trước.',
          ),
          log: error.message,
        };
      }
      throw error;
    }
  }
}
