import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SANDBOX,
  SandboxError,
  type SandboxRunner,
} from '../../sandbox/sandbox.interface.js';
import {
  firstRenderError,
  type PdfRenderer,
  type PdfRenderResult,
} from '../pdf-render.js';

/** Ảnh Chromium. `DockerSandbox` đặt `--pull never` nên phải build trước. */
export const PDF_IMAGE = process.env.PDF_IMAGE ?? 'aijob-pdf';

/** Qua `docker run` thì phần lớn thời gian là khởi container chứ không phải in. */
const RENDER_TIMEOUT_MS = 45_000;

/** Thư mục làm việc bên trong container, do `DockerSandbox` quy định. */
const WORK = '/work';

const HTML_NAME = 'document.html';
const PDF_NAME = 'document.pdf';

/**
 * Dòng lệnh in. PHẢI khớp `chromium_argv` trong `pdf-service/server.py` - bản kia
 * mới là bản dùng khi chạy thật. Test đơn vị canh hai cờ an toàn không rơi mất.
 */
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
  `--print-to-pdf=${WORK}/${PDF_NAME}`,
  `file://${WORK}/${HTML_NAME}`,
];

/** In bằng cách chạy `docker run` qua SEAM 2. Dùng cho máy phát triển. */
@Injectable()
export class SandboxPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger(SandboxPdfRenderer.name);

  constructor(@Inject(SANDBOX) private readonly sandbox: SandboxRunner) {}

  /** Runtime container có dùng được hay không. */
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
        artifacts: [PDF_NAME],
        limits: { memoryMb: 1024 },
      });

      const pdf = result.artifacts[PDF_NAME];

      if (!pdf || pdf.byteLength === 0) {
        const log = result.stderr || result.stdout;
        return { ok: false, reason: firstRenderError(log), log };
      }

      return { ok: true, pdf, pages: countPages(pdf) };
    } catch (error) {
      if (error instanceof SandboxError) {
        this.logger.error(`In PDF thất bại (${error.kind}): ${error.message}`);
        return { ok: false, reason: sandboxReason(error), log: error.message };
      }
      throw error;
    }
  }
}

/**
 * Đếm số trang. Bản TypeScript của `count_pages` trong `pdf-service/server.py`.
 * `latin1` chứ không phải `utf8`: utf8 thay byte không hợp lệ bằng U+FFFD.
 */
export function countPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

/** Câu cho người dùng, theo từng nguyên nhân của sandbox. */
function sandboxReason(error: SandboxError): string {
  switch (error.kind) {
    case 'TIMEOUT':
      return 'Quá thời gian khi tạo PDF. Hãy thử lại; nếu vẫn vậy thì tài liệu có thể quá dài.';
    case 'RUNTIME_UNAVAILABLE':
      return 'Máy chủ chưa bật được môi trường tạo PDF. Đây là lỗi cấu hình phía hệ thống, không phải do tài liệu của bạn.';
    case 'IMAGE_MISSING':
      return 'Máy chủ chưa có bộ công cụ in PDF. Người vận hành cần build ảnh aijob-pdf trước.';
    default:
      return 'Không tạo được PDF.';
  }
}
