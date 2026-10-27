import {
  guardSuggestions,
  tooVague,
  type BulletFacts,
} from 'src/modules/documents/utils/bullet-rewrite.js';

const FACTS: BulletFacts = {
  profileSkills: ['PostgreSQL', 'Redis', 'ES6'],
  jobSkills: ['PostgreSQL', 'Redis', 'Microservices', 'Java'],
  jobTitle: 'Backend Developer',
};

describe('guardSuggestions', () => {
  test('số không có trong dòng gốc thành ô trống, số đã có thì giữ', () => {
    const [result] = guardSuggestions(
      ['Tối ưu 12 module PostgreSQL, giảm thời gian phản hồi 35% và 1.5 giây'],
      'Tối ưu 12 module thanh toán',
      FACTS,
    );

    expect(result.text).toBe(
      'Tối ưu 12 module PostgreSQL, giảm thời gian phản hồi [__]% và [__] giây',
    );
  });

  test('chữ số dính trong tên kỹ năng không bị đục', () => {
    const [result] = guardSuggestions(
      ['Viết lại giao diện bằng ES6 cho trang đặt lịch'],
      'Viết giao diện trang đặt lịch',
      FACTS,
    );

    expect(result.text).toBe('Viết lại giao diện bằng ES6 cho trang đặt lịch');
  });

  test('bỏ gợi ý nhắc từ khoá của tin mà hồ sơ không có', () => {
    const result = guardSuggestions(
      [
        'Tách hệ thống thành Microservices dùng Redis',
        'Thêm bộ nhớ đệm Redis cho API đọc nhiều',
      ],
      'Tham gia tối ưu hệ thống',
      FACTS,
    );

    expect(result).toEqual([
      { text: 'Thêm bộ nhớ đệm Redis cho API đọc nhiều', keywords: ['Redis'] },
    ]);
  });

  test('"Java" của tin không chặn câu nhắc JavaScript', () => {
    const result = guardSuggestions(
      ['Viết script JavaScript tự động hoá báo cáo'],
      'Viết script tự động hoá báo cáo',
      FACTS,
    );

    expect(result).toHaveLength(1);
  });

  test('bỏ gợi ý tự nâng vai trò khi dòng gốc không nói vậy', () => {
    const result = guardSuggestions(
      ['Dẫn dắt nhóm tối ưu PostgreSQL'],
      'Tham gia tối ưu PostgreSQL',
      FACTS,
    );

    expect(result).toEqual([]);
  });
});

describe('tooVague', () => {
  test('câu kinh nghiệm dưới bốn từ là quá ít ý', () => {
    expect(tooVague('experience', 'Làm việc nhóm')).toBe(true);
    expect(tooVague('experience', 'Tham gia tối ưu hệ thống')).toBe(false);
  });

  test('chức danh và năng lực ngắn vẫn viết lại được', () => {
    expect(tooVague('headline', 'Backend Developer')).toBe(false);
    expect(tooVague('competency', 'Kiểm thử')).toBe(false);
  });
});
