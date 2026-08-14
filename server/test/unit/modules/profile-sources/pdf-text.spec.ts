import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractPdfText,
  MAX_PDF_BYTES,
  MIN_CHARS_PER_PAGE,
  PdfExtractError,
} from 'src/modules/profile-sources/pdf-text.js';

/**
 * Test chạy trên một PDF THẬT, không phải bản giả.
 *
 * `test/fixtures/cv-tieng-viet.pdf` do Chromium in ra từ một CV tiếng Việt có dấu
 * đầy đủ. Giả lập `pdf-parse` ở đây sẽ vô nghĩa: điều duy nhất đáng kiểm là dấu
 * tiếng Việt có sống qua vòng trích xuất hay không, mà một bản giả thì trả lại
 * đúng chuỗi tôi tự nhập vào.
 */
const FIXTURE = join(__dirname, '../../../fixtures/cv-tieng-viet.pdf');

const cvPdf = (): Buffer => readFileSync(FIXTURE);

describe('extractPdfText trên CV tiếng Việt thật', () => {
  test('giữ nguyên dấu tiếng Việt', async () => {
    const result = await extractPdfText(cvPdf());

    // Từng chữ dưới đây có một loại dấu khác nhau: dấu huyền + dấu sắc ở "Trần
    // Bá", ngã ở "Kỹ", móc ở "Đại", và ơ/ư ở "Phần mềm". Mất bất kỳ lớp mã hoá
    // nào là một trong số này sẽ đứt.
    expect(result.text).toContain('Trần Bá Mậu');
    expect(result.text).toContain('Kỹ sư Backend');
    expect(result.text).toContain('Đại học Bách khoa Hà Nội');
    expect(result.text).toContain('Giải pháp Phần mềm Việt');
    expect(result.text).toContain('Đà Nẵng');

    /*
     * Ký tự thay thế: nếu xuất hiện thì có một khâu giải mã hoặc một font đã hỏng.
     *
     * Phải canh CẢ HAI mã. Bản đầu chỉ canh U+FFFD, và nó đã bỏ sót một lỗi thật: PDF
     * thư xin việc cho ra `Ph￿m Qu￿n Tr￿` — toàn ký tự **U+FFFF**, vì font Lato/Raleway
     * đi kèm bản fork không có glyph tiếng Việt. Phép kiểm khi đó báo xanh.
     */
    expect(result.text).not.toContain('�');
    expect(result.text).not.toContain('￿');
    expect(result.text).not.toContain('?????');
  });

  test('giữ được con số và ký hiệu, vì đó là phần định lượng của CV', async () => {
    const result = await extractPdfText(cvPdf());

    expect(result.text).toContain('4,1%');
    expect(result.text).toContain('240 ms');
    expect(result.text).toContain('03/2022');
    expect(result.text).toContain('tranbamau97@gmail.com');
  });

  test('nhận ra là CÓ lớp text', async () => {
    const result = await extractPdfText(cvPdf());

    expect(result.hasTextLayer).toBe(true);
    expect(result.pages).toBe(1);
    expect(result.pagesRead).toBe(1);
    expect(result.text.length).toBeGreaterThan(MIN_CHARS_PER_PAGE);
  });

  test('text đã được trim, không có khoảng trắng thừa hai đầu', async () => {
    const result = await extractPdfText(cvPdf());

    expect(result.text).toBe(result.text.trim());
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe('extractPdfText với đầu vào không dùng được', () => {
  test('file quá lớn bị chặn TRƯỚC khi parse', async () => {
    // Buffer rác, không phải PDF: nếu phép kiểm kích thước chạy sau parse thì
    // test này sẽ nhận 'INVALID' thay vì 'TOO_LARGE'. Đó chính là điều cần ghim —
    // kiểm kích thước phải đứng trước để không nạp file khổng lồ vào pdfjs.
    const tooBig = Buffer.alloc(MAX_PDF_BYTES + 1, 0x41);

    await expect(extractPdfText(tooBig)).rejects.toMatchObject({
      name: 'PdfExtractError',
      kind: 'TOO_LARGE',
    });
  });

  test('file không phải PDF bị phân loại INVALID', async () => {
    const notPdf = Buffer.from('Đây chỉ là văn bản thường, không phải PDF.');

    await expect(extractPdfText(notPdf)).rejects.toBeInstanceOf(
      PdfExtractError,
    );
    await expect(extractPdfText(notPdf)).rejects.toMatchObject({
      kind: 'INVALID',
    });
  });

  test('buffer rỗng cũng là INVALID, không phải crash', async () => {
    await expect(extractPdfText(Buffer.alloc(0))).rejects.toMatchObject({
      kind: 'INVALID',
    });
  });

  test('PDF bị cắt dở dang không làm sập tiến trình', async () => {
    // Một nửa file thật: header đúng nhưng bảng tham chiếu chéo bị đứt. Đây là
    // dạng hỏng hay gặp nhất trong thực tế — upload bị ngắt giữa đường.
    const half = cvPdf().subarray(0, 2_000);

    await expect(extractPdfText(half)).rejects.toBeInstanceOf(PdfExtractError);
  });
});
