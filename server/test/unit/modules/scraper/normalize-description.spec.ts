import {
  normalizeCard,
  normalizeDescription,
} from 'src/modules/scraper/sources/normalize.js';

describe('normalizeDescription', () => {
  test('gộp dòng trống liên tiếp còn một dòng trống', () => {
    expect(normalizeDescription('A\n\n\n\n\nB')).toBe('A\n\nB');
  });

  test('gộp cả khi giữa các dòng trống có dấu cách', () => {
    expect(normalizeDescription('A\n \n \nB')).toBe('A\n\nB');
    expect(normalizeDescription('A\n\t\n  \n\tB')).toBe('A\n\nB');
  });

  test('cắt khoảng trắng ở hai đầu mỗi dòng', () => {
    expect(normalizeDescription('  A  \n   B   ')).toBe('A\nB');
  });

  test('gộp dấu cách liên tiếp nhưng GIỮ xuống dòng', () => {
    expect(normalizeDescription('A    B\nC')).toBe('A B\nC');
  });

  test('quy \\r\\n về \\n', () => {
    expect(normalizeDescription('A\r\nB\rC')).toBe('A\nB\nC');
  });

  test('chuỗi chỉ có khoảng trắng thành null', () => {
    expect(normalizeDescription('   \n\n  ')).toBeNull();
    expect(normalizeDescription(null)).toBeNull();
  });
});

describe('normalizeCard dọn mô tả trước khi lưu', () => {
  const card = (description: string) =>
    normalizeCard({
      id: '1',
      slug: 'a',
      title: 'Lập trình viên',
      url: 'https://example.com/1',
      description,
    });

  test('mô tả nhiều dòng trống được dọn', () => {
    expect(card('Mô tả\n \n \nYêu cầu')?.description).toBe('Mô tả\n\nYêu cầu');
  });
});
