import { Injectable, Logger } from '@nestjs/common';
import {
  firstTexError,
  missingGlyphs,
  type LatexCompiler,
  type LatexCompileResult,
} from './latex-compile.js';

/// ĐO ĐƯỢC trên dịch vụ thường trú: lượt đầu 3,6 giây, ổn định 2,6–3,1 giây. Nhanh
/// hơn `docker run` (5,1s) vì không khởi container mỗi lần.
///
/// 70 giây, và nó phải DÀI HƠN mức 55 giây mà chính dịch vụ tự cắt.
///
/// Thứ tự đó quan trọng: dịch vụ hết giờ thì nó trả 422 kèm log, tức một câu trả lời
/// dùng được. App hết giờ trước thì kết nối bị cắt và log mất, nên người dùng nhận
/// "không gọi được dịch vụ" trong khi thật ra tài liệu của họ compile quá lâu — hai
/// nguyên nhân khác nhau dẫn tới hai hành động khác nhau.
const REQUEST_TIMEOUT_MS = 70_000;

/// Ghép các dòng `Missing character` mà dịch vụ gửi qua header.
const WARNING_SEPARATOR = ' | ';

/**
 * Compile bằng cách gọi dịch vụ `latex-compile` qua HTTP.
 *
 * Đây là đường của **production**: app chạy trong container, không có socket Docker,
 * và dịch vụ compile nằm trên một network `internal` không ra được Internet.
 *
 * Dùng `fetch` của Node chứ không thêm thư viện HTTP: Node >= 22 đã có sẵn, và một
 * phụ thuộc mới cho đúng một lời gọi POST là không đáng.
 */
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
      // Không nối được tới dịch vụ: sai cấu hình, hoặc dịch vụ chưa lên. Người dùng
      // không làm gì được, nên phải nói rõ đây là phía hệ thống.
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

      // Dịch vụ chỉ trả 200 khi PDF khác rỗng, nhưng vẫn kiểm lại ở đây: một proxy
      // ở giữa có thể trả 200 với thân rỗng, và một PDF 0 byte thì tệ hơn một lỗi.
      if (pdf.byteLength === 0) {
        return {
          ok: false,
          reason: 'Dịch vụ tạo PDF trả về file rỗng.',
          log: '',
        };
      }

      return { ok: true, pdf, warnings: this.readWarnings(response) };
    }

    // Dịch vụ trả 422 kèm log khi compile hỏng. Rút lỗi LaTeX bằng cùng hàm mà
    // adapter Docker dùng.
    const log = await this.readLog(response);
    return { ok: false, reason: firstTexError(log), log };
  }

  /**
   * Đọc cảnh báo ký tự font từ header.
   *
   * Header mang các dòng `Missing character` ghép bằng ` | ` rồi **mã hoá base64**.
   * Base64 không phải để cho gọn: những dòng đó chứa ký tự tiếng Việt, mà giá trị
   * header HTTP phải là ISO-8859-1 — gửi thẳng thì `fetch` của Node từ chối cả phản
   * hồi, và app báo "không nối được tới dịch vụ", một lỗi sai hoàn toàn hướng.
   *
   * Giải mã rồi tách lại thành dòng để đưa qua ĐÚNG hàm `missingGlyphs` mà adapter
   * Docker dùng: chỉ một bộ parser, và nó là bộ đã có test.
   */
  private readWarnings(response: Response): string[] {
    const header = response.headers.get('x-latex-warnings-b64');
    if (!header) return [];

    let decoded: string;
    try {
      decoded = Buffer.from(header, 'base64').toString('utf8');
    } catch {
      // Header hỏng thì bỏ cảnh báo, KHÔNG làm hỏng cả lượt tạo PDF: người dùng đã
      // có file dùng được, và cảnh báo chỉ là thông tin thêm.
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
      // Thân không phải JSON (ví dụ một trang lỗi của proxy). Để `firstTexError`
      // trả câu mặc định thay vì đoán.
      return '';
    }
  }
}
