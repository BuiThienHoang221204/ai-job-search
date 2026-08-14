import { Injectable } from '@nestjs/common';
import type { Evidence, ProfileSource } from './evidence.js';
import { extractPdfText, PdfExtractError } from './pdf-text.js';

/**
 * Đầu vào của nguồn CV PDF.
 *
 * `filename` không dùng để đọc file (buffer đã có sẵn) mà để làm nhãn ở màn xác
 * nhận — người dùng nộp hai CV thì phải phân biệt được mẩu bằng chứng nào từ file
 * nào.
 */
export type CvPdfInput = {
  data: Buffer;
  filename: string;
};

/// Số ký tự tối đa của text đưa vào prompt tổng hợp.
///
/// Một CV 2 trang có lớp text vào khoảng 2.500–5.000 ký tự (fixture: 1.279 cho
/// một trang dày). Mốc 40.000 chứa được cả CV 10 trang mà vẫn chặn được trường
/// hợp ai đó nộp một luận văn 200 trang đổi tên thành `cv.pdf`.
///
/// Đây là chặn về CHI PHÍ và về prompt injection, không phải về tính đúng đắn:
/// text dài hơn thì bị cắt cuối và có ghi lại trong `meta.truncated`, chứ không
/// bị từ chối. Từ chối một CV chỉ vì nó dài là làm khó người dùng vì lỗi của họ
/// không phải lỗi.
export const MAX_EVIDENCE_CHARS = 40_000;

/**
 * Áp giới hạn độ dài lên text bằng chứng.
 *
 * Là hàm riêng, export ra, để test được nó THẬT. Trước đó phép cắt nằm inline
 * trong `collect`, nên test độ dài phải tự viết lại đúng biểu thức đó — một test
 * tautology: nó luôn xanh, kể cả khi code thật sai.
 */
export function boundEvidenceText(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= MAX_EVIDENCE_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_EVIDENCE_CHARS), truncated: true };
}

/// Ném khi PDF là bản scan (không có lớp text).
///
/// Là lớp lỗi riêng chứ không phải một `Evidence` rỗng: caller BUỘC phải xử lý
/// tình huống này, và một `Evidence` với `text: ''` sẽ lặng lẽ chảy tiếp vào
/// prompt rồi cho ra một hồ sơ trắng mà không ai biết vì sao.
export class ScannedPdfError extends Error {
  constructor() {
    super(
      'PDF này không có lớp text nên gần như chắc chắn là bản scan hoặc ảnh chụp',
    );
    this.name = 'ScannedPdfError';
  }
}

/**
 * SEAM 3 · adapter thứ nhất — đọc lớp text của CV PDF.
 *
 * Ưu tiên lớp text trước, đúng như mục 4 của lộ trình: đa số CV đều có lớp text
 * (mọi CV xuất từ Word, LaTeX, Canva, hay in từ trình duyệt), nên đường này xử lý
 * phần lớn trường hợp mà **không tốn một lượt gọi model nào**. Điều đó quan trọng
 * hơn bình thường ở đây: gateway free có hạn mức cạn trong một buổi làm việc.
 *
 * PDF scan thì ném `ScannedPdfError`. Đường vision là **adapter riêng**
 * (`CV_PDF_VISION`) chứ không phải một nhánh `if` trong này — hai đường có chi
 * phí, độ trễ và cách hỏng hoàn toàn khác nhau, gộp vào một class thì không thể
 * test riêng cũng không thể tính hạn mức riêng.
 */
@Injectable()
export class CvPdfSource implements ProfileSource<CvPdfInput> {
  readonly kind = 'CV_PDF_TEXT' as const;

  async collect({ data, filename }: CvPdfInput): Promise<Evidence[]> {
    const result = await extractPdfText(data);

    if (!result.hasTextLayer) throw new ScannedPdfError();

    const { text, truncated } = boundEvidenceText(result.text);

    return [
      {
        kind: this.kind,
        label: filename,
        text,
        meta: {
          pages: result.pages,
          pagesRead: result.pagesRead,
          chars: result.text.length,
          truncated,
          // Ghi lại số byte gốc: khi một CV cho ra hồ sơ nghèo nàn, biết được file
          // 8MB mà chỉ có 900 ký tự text là dấu hiệu rất rõ rằng phần lớn nội dung
          // nằm trong ảnh.
          bytes: data.byteLength,
        },
      },
    ];
  }
}

/// Gom `PdfExtractError` và `ScannedPdfError` về một câu cho người dùng.
///
/// Nằm ở đây thay vì trong controller vì mỗi phân loại dẫn tới một hành động khác
/// nhau, và chính bảng dưới đây là chỗ ghi lại các hành động đó — cùng lý do với
/// `lib/failure-message.ts` phía frontend.
export function cvPdfErrorMessage(error: unknown): string | null {
  if (error instanceof ScannedPdfError) {
    return 'File này là bản scan hoặc ảnh chụp, chưa đọc được. Hãy nộp bản PDF xuất trực tiếp từ Word, LaTeX hoặc Canva.';
  }
  if (!(error instanceof PdfExtractError)) return null;

  switch (error.kind) {
    case 'ENCRYPTED':
      return 'File PDF này có mật khẩu. Hãy bỏ mật khẩu rồi nộp lại.';
    case 'INVALID':
      return 'File không phải PDF hợp lệ, hoặc đã bị hỏng trong lúc tải lên.';
    case 'TOO_LARGE':
      return 'File quá lớn. Giới hạn là 10MB — một CV có lớp text thường dưới 2MB.';
    default:
      return 'Không đọc được file PDF này.';
  }
}
