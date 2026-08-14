import { PDFParse } from 'pdf-parse';

/**
 * Rút lớp text của một file PDF.
 *
 * Module này bọc kín `pdf-parse`, và đó là toàn bộ lý do nó tồn tại: phần còn lại
 * của hệ thống không được biết thư viện nào đang đọc PDF. Nhờ vậy đổi sang
 * `unpdf` hay `pdfjs-dist` chỉ là sửa đúng file này.
 *
 * ĐÃ THỬ THẬT trước khi chọn: `pdf-parse` v2 giữ nguyên dấu tiếng Việt. Trên một
 * CV do Chromium in ra (`test/fixtures/cv-tieng-viet.pdf`), "Trần Bá Mậu", "Kỹ
 * thuật Máy tính", "Đà Nẵng" đều ra đúng từng dấu. Đây là điều kiện tiên quyết —
 * mục 4 của lộ trình đã cảnh báo chất lượng tiếng Việt là rủi ro chính của khâu
 * đọc CV, nên nó phải được đo chứ không được tin.
 *
 * Vì sao `pdf-parse` chứ không `unpdf`: nó trả về `total` (số trang) cùng text
 * từng trang, mà phép nhận biết PDF scan dưới đây cần đúng hai thứ đó; và nó có
 * type CommonJS nên không phải khai lại kiểu.
 *
 * Lý do KHÔNG phải là "tránh được ESM trong jest" — tôi đã tưởng vậy và đã sai.
 * Bản CJS của `pdf-parse` vẫn nạp worker pdfjs bằng `import()` động, `unpdf` cũng
 * thế, nên bộ test đơn vị bắt buộc phải chạy qua `test/run-unit.mjs` với cờ
 * `--experimental-vm-modules`. Chi tiết và những cách đã thử mà không được nằm
 * trong docblock của file đó — đừng thử lại.
 */

/// Kích thước file lớn nhất nhận vào.
///
/// 10MB là rộng rãi cho một CV có lớp text (bản Chromium in ra ở fixture chỉ 41KB;
/// CV có ảnh chân dung thường dưới 2MB). Giới hạn này KHÔNG phải để tiết kiệm đĩa
/// mà để chặn việc nạp cả một file khổng lồ vào RAM rồi mới phát hiện nó vô dụng.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/// Số trang lớn nhất được đọc.
///
/// CV dài quá 10 trang thì gần như chắc chắn không phải CV. Chặn ở đây vì mỗi
/// trang đều thành token trong prompt tổng hợp.
export const MAX_PDF_PAGES = 10;

/// Dưới ngưỡng này thì coi như KHÔNG có lớp text.
///
/// Một trang CV có lớp text thật cho ra khoảng 1.000–2.500 ký tự (fixture: 1.279
/// ký tự cho một trang dày). Một trang scan cho ra 0, hoặc vài chục ký tự rác từ
/// watermark và số trang. Mốc 120 ký tự/trang nằm giữa hai vùng đó và không sát
/// bên nào.
///
/// Vì sao phải tính THEO TRANG chứ không theo tổng: một CV 3 trang scan kèm đúng
/// một trang bìa có text sẽ vượt mọi ngưỡng tính theo tổng, rồi đi tiếp với 1/3
/// nội dung mà không ai biết.
export const MIN_CHARS_PER_PAGE = 120;

export type PdfTextResult = {
  /// Text đã ghép của các trang đọc được. Là dữ liệu KHÔNG TIN CẬY: nó do người
  /// dùng nộp lên và sẽ đi vào prompt. Xem `cv-pdf.source.ts`.
  text: string;
  /// Tổng số trang của tài liệu, kể cả phần bị `MAX_PDF_PAGES` cắt.
  pages: number;
  /// Số trang thực sự đã đọc.
  pagesRead: number;
  /// false nghĩa là PDF scan (ảnh), cần đường vision thay vì đường text.
  hasTextLayer: boolean;
};

export type PdfErrorKind =
  /// File không phải PDF, hoặc hỏng.
  | 'INVALID'
  /// PDF có mật khẩu.
  | 'ENCRYPTED'
  /// Vượt `MAX_PDF_BYTES`.
  | 'TOO_LARGE'
  | 'OTHER';

export class PdfExtractError extends Error {
  constructor(
    readonly kind: PdfErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PdfExtractError';
  }
}

/// Phân loại lỗi của pdfjs theo TÊN LỚP, không theo nội dung thông báo.
///
/// pdf-parse export sẵn các lớp lỗi của pdfjs, nhưng đối chiếu bằng `instanceof`
/// thì lại gắn chặt vào đúng một bản build. Đối chiếu theo `name` là cách chính
/// `failure-kind.ts` đang làm cho AI SDK, và vì cùng một lý do.
function classifyPdfError(error: unknown): PdfErrorKind {
  const name = (error as { name?: string })?.name ?? '';
  const message = error instanceof Error ? error.message : String(error);

  if (name === 'PasswordException') return 'ENCRYPTED';
  if (name === 'InvalidPDFException') return 'INVALID';
  // pdfjs không luôn dùng đúng lớp lỗi; hai chuỗi này là đường lùi.
  if (/password/i.test(message)) return 'ENCRYPTED';
  if (/invalid pdf|no pdf header|structure/i.test(message)) return 'INVALID';
  return 'OTHER';
}

/**
 * Đọc lớp text của PDF.
 *
 * Ném `PdfExtractError` cho mọi trường hợp không đọc được, đã phân loại — caller
 * cần biết "file có mật khẩu" khác "file hỏng", vì hai thứ đó dẫn tới hai câu
 * khác nhau cho người dùng.
 *
 * KHÔNG ném khi PDF là bản scan: đó là trường hợp hợp lệ, trả về
 * `hasTextLayer: false` để caller chuyển sang đường vision.
 */
export async function extractPdfText(data: Buffer): Promise<PdfTextResult> {
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new PdfExtractError(
      'TOO_LARGE',
      `File ${Math.round(data.byteLength / 1024 / 1024)}MB, vượt giới hạn ${MAX_PDF_BYTES / 1024 / 1024}MB`,
    );
  }

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ last: MAX_PDF_PAGES });

    const pages = result.total;
    const pagesRead = Math.min(pages, MAX_PDF_PAGES);
    const text = (result.text ?? '').trim();

    return {
      text,
      pages,
      pagesRead,
      // `pagesRead` có thể là 0 với PDF rỗng; phép chia phải an toàn.
      hasTextLayer:
        pagesRead > 0 && text.length / pagesRead >= MIN_CHARS_PER_PAGE,
    };
  } catch (error) {
    throw new PdfExtractError(
      classifyPdfError(error),
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    // `destroy()` bắt buộc: pdfjs giữ worker và buffer sống, không gọi thì mỗi
    // lần upload rò một ít bộ nhớ cho tới khi tiến trình chết.
    await parser.destroy();
  }
}
