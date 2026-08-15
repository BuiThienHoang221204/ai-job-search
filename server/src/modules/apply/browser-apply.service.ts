import { Inject, Injectable, Logger } from '@nestjs/common';
import { APPLY_SCRIPT } from './apply-script.js';
import {
  buildFillRules,
  classifyOutcome,
  COVER_FILENAME,
  CV_FILENAME,
  LOGIN_MARKERS,
  outcomeMessage,
  QUESTION_MARKS,
  type ApplyIdentity,
} from './field-plan.js';
import type { ApplyResult, PageReport } from './apply.types.js';
import {
  SANDBOX,
  SandboxError,
  type SandboxRunner,
} from '../sandbox/sandbox.interface.js';

/**
 * Ảnh phải được tải trước. `--pull never` của sandbox biến ảnh thiếu thành một lỗi
 * nói rõ, thay vì một lượt tải 3,54GB giữa request của người dùng.
 */
export const BROWSER_IMAGE = 'aijob-browser:1.62.1';

/**
 * Cả lượt chạy: khởi Chromium + tải trang + điền + chụp ảnh. Đo được trên một lượt
 * thật là ~13 giây, nên 90 giây là rộng rãi mà vẫn không để một trang treo giữ chỗ
 * worker quá lâu.
 */
const RUN_TIMEOUT_MS = 90_000;

/**
 * Riêng cho việc điều hướng, phải NHỎ HƠN hạn của cả lượt: hết hạn điều hướng thì
 * script vẫn ghi được báo cáo và ta biết vì sao, còn hết hạn cả lượt thì container
 * bị giết và không còn gì để đọc.
 */
const NAVIGATION_TIMEOUT_MS = 45_000;

/**
 * Chromium ăn nhiều RAM hơn LaTeX. 512MB mặc định của sandbox không đủ - tab đầu
 * tiên đã chiếm gần hết và trang nặng sẽ bị OOM-kill, cho ra một lỗi vô nghĩa.
 */
const MEMORY_MB = 2048;
const CPUS = 2;

/**
 * Nhãn nút chấp nhận cookie, tiếng Việt và tiếng Anh. Banner cookie che cả nút ứng
 * tuyển lẫn form - đã gặp đúng chuyện đó trên topcv.vn khi đo bằng tay.
 */
const COOKIE_BUTTONS = [
  'chấp nhận tất cả',
  'đồng ý',
  'accept all',
  'accept cookies',
  'got it',
];

export interface ApplyRequest {
  /** Link tin tuyển dụng. Dữ liệu KHÔNG tin cậy: nó đến từ trang của người khác. */
  url: string;
  identity: ApplyIdentity;
  /** PDF của CV đã sinh. Vắng thì vẫn chạy, chỉ không đính kèm được. */
  cv?: Buffer;
  /** PDF thư xin việc. Có thì đính vào ô "Cover Letter" nếu form có ô đó. */
  coverLetter?: Buffer;
}

/** Assisted Apply — mở link, điền form, chụp ảnh, **DỪNG**. */
@Injectable()
export class BrowserApplyService {
  private readonly logger = new Logger(BrowserApplyService.name);

  constructor(@Inject(SANDBOX) private readonly sandbox: SandboxRunner) {}

  async run(request: ApplyRequest): Promise<ApplyResult> {
    const rules = buildFillRules(request.identity, {
      cv: Boolean(request.cv),
      coverLetter: Boolean(request.coverLetter),
    });

    const files: Record<string, string | Buffer> = {
      'apply.mjs': APPLY_SCRIPT,
      'input.json': JSON.stringify({
        url: request.url,
        rules,
        loginMarkers: LOGIN_MARKERS,
        questionMarks: QUESTION_MARKS,
        cookieButtons: COOKIE_BUTTONS,
        navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
      }),
    };
    if (request.cv) files[CV_FILENAME] = request.cv;
    if (request.coverLetter) files[COVER_FILENAME] = request.coverLetter;

    let result;
    try {
      result = await this.sandbox.run({
        image: BROWSER_IMAGE,
        files,
        command: ['node', 'apply.mjs'],
        timeoutMs: RUN_TIMEOUT_MS,
        artifacts: ['report.json', 'screenshot.png'],
        network: 'egress',
        limits: { memoryMb: MEMORY_MB, cpus: CPUS },
      });
    } catch (error) {
      return this.fromSandboxError(error);
    }

    const report = this.parseReport(result.artifacts['report.json']);
    if (!report) {
      this.logger.error(
        `Không đọc được report.json (exit ${result.exitCode}). stderr: ${result.stderr.slice(0, 500)}`,
      );
      return {
        outcome: 'UNREACHABLE',
        message: outcomeMessage('UNREACHABLE', EMPTY_REPORT),
        filled: [],
        unmatched: [],
      };
    }

    if (report.error) {
      this.logger.warn(`Script báo lỗi: ${report.error}`);
    }

    const outcome = classifyOutcome(report);
    this.logger.log(
      `Assisted Apply ${outcome}: điền ${report.filled.length}, chưa khớp ${report.unmatched.length}, ${request.url}`,
    );

    return {
      outcome,
      message: outcomeMessage(outcome, report),
      filled: report.filled,
      unmatched: report.unmatched,
      screenshot: result.artifacts['screenshot.png'],
    };
  }

  /**
   * Ảnh trình duyệt có sẵn hay không. Dùng để giao diện nói trước thay vì để người
   * dùng bấm rồi mới hỏng.
   */
  available(): Promise<boolean> {
    return this.sandbox.available();
  }

  private parseReport(raw: Buffer | undefined): PageReport | null {
    if (!raw || raw.length === 0) return null;
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as Partial<PageReport>;
      if (typeof parsed.reachable !== 'boolean') return null;
      return {
        ...EMPTY_REPORT,
        ...parsed,
        filled: parsed.filled ?? [],
        unmatched: parsed.unmatched ?? [],
        loginHints: parsed.loginHints ?? [],
      };
    } catch {
      return null;
    }
  }

  /** Lỗi của sandbox → câu cho người dùng. */
  private fromSandboxError(error: unknown): ApplyResult {
    const kind = error instanceof SandboxError ? error.kind : 'OTHER';
    if (error instanceof SandboxError) {
      this.logger.error(`Sandbox lỗi (${kind}): ${error.message}`);
    }

    const message =
      kind === 'TIMEOUT'
        ? 'Quá thời gian khi mở trang tuyển dụng. Trang có thể đang rất chậm — hãy thử lại sau vài phút.'
        : kind === 'IMAGE_MISSING' || kind === 'RUNTIME_UNAVAILABLE'
          ? 'Tính năng điền hồ sơ tự động chưa dùng được vì thiếu cấu hình phía hệ thống. Bạn vẫn tải được CV và thư xin việc để nộp tay.'
          : 'Không mở được trang tuyển dụng. Hãy thử mở link bằng trình duyệt của bạn.';

    return { outcome: 'UNREACHABLE', message, filled: [], unmatched: [] };
  }
}

const EMPTY_REPORT: PageReport = {
  reachable: false,
  status: null,
  visibleInputs: 0,
  hasFileInput: false,
  loginHints: [],
  filled: [],
  unmatched: [],
  error: null,
};
