import { scoreCv } from 'src/modules/cv-check/utils/cv-score.js';
import {
  keepVerbatim,
  segmentByLayout,
} from 'src/modules/cv-check/utils/cv-lines.js';
import { vnDay } from 'src/modules/cv-check/utils/guest.js';

const TEXT = [
  'Nguyễn Văn An · an@email.com · 0901 234 567',
  'KINH NGHIỆM',
  '• Xây dựng API thanh toán cho 2.000 cửa hàng',
  '• Tham gia tối ưu hệ thống',
  'HỌC VẤN',
  'Đại học Bách khoa',
  'KỸ NĂNG',
  'NestJS, PostgreSQL',
  'x'.repeat(200),
].join('\n');

describe('segmentByLayout', () => {
  test('lấy dòng có ký hiệu đầu dòng và nhận ra tiêu đề mục', () => {
    expect(segmentByLayout(TEXT)).toEqual({
      sections: ['experience', 'education', 'skills'],
      bullets: [
        'Xây dựng API thanh toán cho 2.000 cửa hàng',
        'Tham gia tối ưu hệ thống',
      ],
    });
  });
});

describe('keepVerbatim', () => {
  test('giữ dòng có thật trong CV (kể cả bị ngắt dòng), bỏ dòng model tự viết', () => {
    const text = 'Xây dựng API thanh toán\ncho 2.000 cửa hàng';
    expect(
      keepVerbatim(
        [
          'Xây dựng API thanh toán cho 2.000 cửa hàng',
          'Tăng doanh thu 300% nhờ tối ưu',
        ],
        text,
      ),
    ).toEqual(['Xây dựng API thanh toán cho 2.000 cửa hàng']);
  });
});

describe('scoreCv', () => {
  const score = (bullets: string[], pages = 1) =>
    scoreCv({
      text: TEXT,
      pages,
      pagesRead: 1,
      sections: ['experience', 'education', 'skills'],
      bullets,
    });

  test('một nửa số dòng có số liệu là đủ điểm số liệu', () => {
    const result = score([
      'Xây dựng API cho 2.000 cửa hàng',
      'Tham gia tối ưu hệ thống',
    ]);
    const metrics = result.checks.find((check) => check.key === 'metrics');
    expect(metrics?.earned).toBe(20);
  });

  test('chấm đủ các nhóm và nêu 3 lỗi mất nhiều điểm nhất', () => {
    const result = score(
      ['Tham gia tối ưu hệ thống', 'Hỗ trợ đội frontend'],
      3,
    );

    expect(result.groups.map((group) => [group.key, group.earned])).toEqual([
      ['ats', 30],
      ['content', 10],
      ['structure', 15],
    ]);
    expect(result.score).toBe(55);
    expect(result.flags.map((flag) => flag.key)).toEqual([
      'metrics',
      'actionVerbs',
      'length',
    ]);
    expect(result.flags[0].sample).toBe('Tham gia tối ưu hệ thống');
  });

  test('ảnh quét không có lớp chữ thì mất điểm máy lọc đọc được', () => {
    const result = scoreCv({
      text: 'abc',
      pages: 1,
      pagesRead: 1,
      sections: [],
      bullets: [],
    });
    expect(
      result.checks.find((check) => check.key === 'textLayer')?.earned,
    ).toBe(0);
  });
});

describe('vnDay', () => {
  test('ngày theo giờ Việt Nam, không theo UTC', () => {
    expect(vnDay(Date.parse('2026-10-27T18:30:00Z'))).toBe('2026-10-28');
  });
});
