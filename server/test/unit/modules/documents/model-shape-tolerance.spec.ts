import { z } from 'zod';
import { coverLetterSchema } from 'src/modules/documents/document.schema.js';
import { boundedList, cappedTextVi } from 'src/common/model-output.js';

const letter = (bodyParagraphs: unknown) => ({
  salutation: 'Kính gửi Bộ phận Tuyển dụng CLT ODC,',
  opening: 'Tôi xin ứng tuyển vị trí Fullstack Javascript Developer.',
  bodyParagraphs,
  motivation: 'Tôi muốn tham gia CLT ODC vì công ty tập trung vào fintech.',
  closing: 'Trân trọng cảm ơn sự quan tâm của ban tuyển dụng.',
});

describe('thư xin việc chịu được đoạn bị bọc thêm một tầng', () => {
  test('nguyên văn hình dạng model trả về ngày 2026-09-17 vẫn parse được', () => {
    const result = coverLetterSchema.safeParse(
      letter([
        { paragraph: 'Tôi có kinh nghiệm Google Apps Script và OCR.' },
        { paragraph: 'Tôi đã xây dựng PWA bằng Next.js 15 và NestJS.' },
      ]),
    );

    expect(result.success).toBe(true);
    expect(result.data?.bodyParagraphs).toEqual([
      'Tôi có kinh nghiệm Google Apps Script và OCR.',
      'Tôi đã xây dựng PWA bằng Next.js 15 và NestJS.',
    ]);
  });

  test('hình dạng đúng vẫn chạy y như cũ', () => {
    const result = coverLetterSchema.safeParse(
      letter(['Đoạn một.', 'Đoạn hai.']),
    );

    expect(result.success).toBe(true);
    expect(result.data?.bodyParagraphs).toEqual(['Đoạn một.', 'Đoạn hai.']);
  });

  test('mảng rỗng vẫn bị từ chối, sàn chất lượng giữ nguyên', () => {
    expect(coverLetterSchema.safeParse(letter([])).success).toBe(false);
  });

  test('object không chứa chuỗi nào thì KHÔNG bịa ra nội dung', () => {
    expect(coverLetterSchema.safeParse(letter([{ so: 1 }])).success).toBe(
      false,
    );
  });
});

describe('boundedList dùng chung cũng chịu được', () => {
  const schema = boundedList(cappedTextVi(80, 'Một kỹ năng.'), 3);

  test('bọc object thì bóc ra', () => {
    expect(
      schema.parse([{ skill: 'Kubernetes' }, { name: 'Terraform' }]),
    ).toEqual(['Kubernetes', 'Terraform']);
  });

  test('vẫn cắt theo trần số lượng', () => {
    expect(schema.parse(['a', 'b', 'c', 'd'])).toHaveLength(3);
  });

  test('JSON schema gửi cho model vẫn khai là mảng chuỗi', () => {
    const json = z.toJSONSchema(schema, { io: 'input' }) as {
      type: string;
      items: { type: string };
    };

    expect(json.type).toBe('array');
    expect(json.items.type).toBe('string');
  });
});
