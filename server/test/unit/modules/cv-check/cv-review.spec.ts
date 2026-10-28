import { cvReviewSchema } from 'src/modules/cv-check/cv-check.schema.js';
import { verifyReview } from 'src/modules/cv-check/utils/cv-review.js';

const TEXT = [
  'KINH NGHIỆM',
  '• Tham gia tối ưu hệ thống',
  '• Xây dựng API cho 2.000 cửa hàng',
].join('\n');

const issue = (quote: string | null, rewrite: string | null = null) => ({
  title: 'Lỗi',
  impact: 'recruiter',
  why: 'Vì sao',
  quote,
  rewrite,
});

const review = (sections: unknown[], ats: unknown[] = []) =>
  verifyReview(
    cvReviewSchema.parse({
      sections: [],
      bullets: [],
      summary: 'Tóm tắt',
      targetRole: 'Backend',
      level: 'junior',
      review: sections,
      ats,
    }),
    TEXT,
  );

describe('verifyReview', () => {
  test('bỏ ý có câu trích không có trong CV, giữ ý không trích', () => {
    const result = review([
      {
        section: 'experience',
        verdict: 'fix',
        note: 'Ghi chú',
        issues: [
          issue('“Tham gia  tối ưu hệ thống”'),
          issue('Dẫn dắt nhóm 10 người'),
          issue(null, 'Viết lại không có trích'),
        ],
      },
    ]);

    expect(result.sections[0].issues.map((item) => item.quote)).toEqual([
      'Tham gia  tối ưu hệ thống',
      null,
    ]);
    expect(result.sections[0].issues[1].rewrite).toBeNull();
  });

  test('câu viết mẫu chỉ giữ số đã có trong đoạn trích', () => {
    const result = review([
      {
        section: 'experience',
        verdict: 'fix',
        note: 'Ghi chú',
        issues: [
          issue(
            'Xây dựng API cho 2.000 cửa hàng',
            'Xây dựng API cho 2.000 cửa hàng, xử lý 5 triệu giao dịch',
          ),
        ],
      },
    ]);

    expect(result.sections[0].issues[0].rewrite).toBe(
      'Xây dựng API cho 2.000 cửa hàng, xử lý [__] triệu giao dịch',
    );
  });

  test('gộp mục trùng, bỏ mục lạ và xếp theo thứ tự cố định', () => {
    const result = review(
      [
        { section: 'skills', verdict: 'ok', note: 'a', issues: [] },
        { section: 'contact', verdict: 'fix', note: 'b', issues: [] },
        { section: 'skills', verdict: 'fix', note: 'c', issues: [] },
        { section: 'hobbies', verdict: 'ok', note: 'd', issues: [] },
      ],
      [
        { key: 'spelling', status: 'warn', note: 'x' },
        { key: 'readingOrder', status: 'fail', note: 'y' },
        { key: 'spelling', status: 'pass', note: 'z' },
      ],
    );

    expect(result.sections.map((part) => [part.section, part.note])).toEqual([
      ['contact', 'b'],
      ['skills', 'a'],
    ]);
    expect(result.ats.map((item) => item.key)).toEqual([
      'readingOrder',
      'spelling',
    ]);
  });
});
