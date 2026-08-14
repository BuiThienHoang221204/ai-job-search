import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boundEvidenceText,
  CvPdfSource,
  cvPdfErrorMessage,
  MAX_EVIDENCE_CHARS,
  ScannedPdfError,
} from 'src/modules/profile-sources/cv-pdf.source.js';
import { PdfExtractError } from 'src/modules/profile-sources/pdf-text.js';

const fixture = (name: string): Buffer =>
  readFileSync(join(__dirname, '../../../fixtures', name));

const CV = 'cv-tieng-viet.pdf';
const SCAN = 'cv-scan-khong-co-text.pdf';

describe('CvPdfSource với CV có lớp text', () => {
  const source = new CvPdfSource();

  test('trả về đúng một mẩu bằng chứng, gắn nhãn theo tên file', async () => {
    const evidence = await source.collect({
      data: fixture(CV),
      filename: 'cv-tran-ba-mau.pdf',
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0].kind).toBe('CV_PDF_TEXT');
    // Nhãn phải là tên file người dùng nộp: màn xác nhận cần trả lời được "AI lấy
    // thông tin này từ đâu", và không có nhãn thì không truy được.
    expect(evidence[0].label).toBe('cv-tran-ba-mau.pdf');
  });

  test('text mang nội dung thật, dấu tiếng Việt còn nguyên', async () => {
    const [evidence] = await source.collect({
      data: fixture(CV),
      filename: CV,
    });

    expect(evidence.text).toContain('Trần Bá Mậu');
    expect(evidence.text).toContain('Đại học Bách khoa Hà Nội');
    expect(evidence.text.length).toBeGreaterThan(500);
  });

  test('meta ghi đủ số liệu để dò khi kết quả nghèo nàn', async () => {
    const data = fixture(CV);
    const [evidence] = await source.collect({ data, filename: CV });

    expect(evidence.meta.pages).toBe(1);
    expect(evidence.meta.pagesRead).toBe(1);
    expect(evidence.meta.truncated).toBe(false);
    expect(evidence.meta.bytes).toBe(data.byteLength);
    // `chars` là độ dài TRƯỚC khi cắt, nên nó vẫn nói đúng CV dài bao nhiêu ngay
    // cả khi `text` đã bị cắt ngắn.
    expect(evidence.meta.chars).toBe(evidence.text.length);
  });
});

describe('boundEvidenceText', () => {
  test('text ngắn đi qua nguyên vẹn, không bị đánh dấu đã cắt', () => {
    const short = 'Kỹ sư backend, 5 năm kinh nghiệm.';
    expect(boundEvidenceText(short)).toEqual({ text: short, truncated: false });
  });

  test('đúng ở mốc giới hạn thì KHÔNG cắt', () => {
    // Lỗi lệch-một hay xảy ra đúng ở đây, và nó im lặng: một CV vừa khít giới hạn
    // bị cắt mất ký tự cuối mà không ai thấy.
    const exact = 'a'.repeat(MAX_EVIDENCE_CHARS);
    expect(boundEvidenceText(exact)).toEqual({ text: exact, truncated: false });
  });

  test('vượt một ký tự thì cắt và đánh dấu', () => {
    const over = 'a'.repeat(MAX_EVIDENCE_CHARS + 1);
    const result = boundEvidenceText(over);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(MAX_EVIDENCE_CHARS);
  });

  test('CV rất dài bị CẮT chứ không bị từ chối', () => {
    // Chính sách có chủ đích: nộp một CV dài không phải là lỗi của người dùng, nên
    // hệ thống không được chặn — chỉ cắt phần đuôi và ghi lại là đã cắt.
    const long = 'Kỹ năng: TypeScript, NestJS, PostgreSQL. '.repeat(2_000);
    const result = boundEvidenceText(long);
    expect(result.text).toHaveLength(MAX_EVIDENCE_CHARS);
    expect(result.text.startsWith('Kỹ năng: TypeScript')).toBe(true);
  });
});

describe('CvPdfSource với PDF scan', () => {
  const source = new CvPdfSource();

  test('ném ScannedPdfError chứ KHÔNG trả bằng chứng rỗng', async () => {
    // Phép khẳng định quan trọng nhất của file này. Trả về `text: ''` thì chuỗi
    // rỗng sẽ chảy tiếp vào prompt tổng hợp, model nhận được một CV trắng, và
    // người dùng thấy một hồ sơ trống mà không có lý do nào hiện ra.
    await expect(
      source.collect({ data: fixture(SCAN), filename: SCAN }),
    ).rejects.toBeInstanceOf(ScannedPdfError);
  });
});

describe('cvPdfErrorMessage', () => {
  test('mỗi nguyên nhân có một câu nói rõ bước tiếp theo', () => {
    const cases: Array<[unknown, RegExp]> = [
      [new ScannedPdfError(), /bản scan|ảnh chụp/i],
      [new PdfExtractError('ENCRYPTED', 'x'), /mật khẩu/i],
      [new PdfExtractError('INVALID', 'x'), /không phải PDF|hỏng/i],
      [new PdfExtractError('TOO_LARGE', 'x'), /quá lớn|10MB/i],
    ];

    for (const [error, pattern] of cases) {
      const message = cvPdfErrorMessage(error);
      expect(message).toMatch(pattern);
      // Không câu nào được lộ tên lớp lỗi hay chi tiết kỹ thuật ra cho người dùng.
      expect(message).not.toMatch(/Error|PdfExtract|pdfjs|buffer/i);
    }
  });

  test('lỗi lạ trả null để caller không nhận vơ là lỗi PDF', () => {
    // Nếu chỗ này trả một câu mặc định, mọi bug thật (ví dụ hết bộ nhớ) sẽ bị
    // hiện thành "không đọc được file PDF" và biến mất khỏi tầm mắt.
    expect(cvPdfErrorMessage(new Error('kết nối database đứt'))).toBeNull();
    expect(cvPdfErrorMessage('chuỗi lạ')).toBeNull();
  });
});
