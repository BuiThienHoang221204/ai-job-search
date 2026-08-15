import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SANDBOX,
  SandboxError,
  type SandboxRunner,
} from '../sandbox/sandbox.interface.js';
import {
  firstTexError,
  missingGlyphs,
  type LatexCompiler,
  type LatexCompileResult,
} from './latex-compile.js';

/**
 * Ảnh TeX Live. **8,92GB** — người vận hành phải `docker pull` trước, và
 * `DockerSandbox` đặt `--pull never` nên thiếu ảnh sẽ báo lỗi rõ thay vì tải giữa
 * một request.
 */
export const LATEX_IMAGE = process.env.LATEX_IMAGE ?? 'aijob-latex';

/**
 * ĐO ĐƯỢC qua `docker run`, gồm cả thời gian khởi container: 4,6–5,1 giây.
 * 60 giây là biên rộng gấp hơn mười lần, đủ cho một CV dài hoặc máy đang tải cao,
 * mà vẫn ngắn hơn hẳn `server.setTimeout` 5 phút.
 */
const COMPILE_TIMEOUT_MS = 60_000;

const TEX_NAME = 'main.tex';
const PDF_NAME = 'main.pdf';
const LOG_NAME = 'main.log';

/** Compile bằng cách chạy `docker run` qua SEAM 2. */
@Injectable()
export class SandboxLatexCompiler implements LatexCompiler {
  private readonly logger = new Logger(SandboxLatexCompiler.name);

  constructor(@Inject(SANDBOX) private readonly sandbox: SandboxRunner) {}

  available(): Promise<boolean> {
    return this.sandbox.available();
  }

  /**
   * MỘT lượt chạy là đủ, và đó là điều đã kiểm chứ không phải giả định: log của
   * `rerunfilecheck` báo `File 'main.out' has not changed`, vì template không có
   * mục lục lẫn tham chiếu chéo. Thêm `\tableofcontents` hay `\ref` vào template
   */
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
        artifacts: [PDF_NAME, LOG_NAME],
      });

      const log = result.artifacts[LOG_NAME]?.toString() ?? result.stdout;
      const pdf = result.artifacts[PDF_NAME];

      if (!pdf || pdf.byteLength === 0) {
        return { ok: false, reason: firstTexError(log), log };
      }

      return { ok: true, pdf, warnings: missingGlyphs(log) };
    } catch (error) {
      if (error instanceof SandboxError) {
        this.logger.error(
          `Compile PDF thất bại (${error.kind}): ${error.message}`,
        );
        return { ok: false, reason: sandboxReason(error), log: error.message };
      }
      throw error;
    }
  }
}

/** Câu cho người dùng, theo từng nguyên nhân của sandbox. */
function sandboxReason(error: SandboxError): string {
  switch (error.kind) {
    case 'TIMEOUT':
      return 'Quá thời gian khi tạo PDF. Hãy thử lại; nếu vẫn vậy thì tài liệu có thể quá dài.';
    case 'RUNTIME_UNAVAILABLE':
      return 'Máy chủ chưa bật được môi trường tạo PDF. Đây là lỗi cấu hình phía hệ thống, không phải do tài liệu của bạn.';
    case 'IMAGE_MISSING':
      return 'Máy chủ chưa có bộ công cụ LaTeX. Người vận hành cần tải ảnh TeX Live trước.';
    default:
      return 'Không tạo được PDF.';
  }
}
