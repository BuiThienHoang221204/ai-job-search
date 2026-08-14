import {
  normaliseSkill,
  recurringGaps,
} from 'src/modules/dashboard/skill-gaps.js';

const job = (...tags: string[]) => ({ job: { tags } });

describe('normaliseSkill', () => {
  test.each([
    ['ReactJS', 'React'],
    ['NodeJS', 'Node'],
    ['Next.js', 'NextJS'],
    ['Vue.js', 'VueJS'],
    ['Express JS', 'ExpressJS'],
  ])('%s và %s được coi là một', (a, b) => {
    expect(normaliseSkill(a)).toBe(normaliseSkill(b));
  });

  test('không nhầm JavaScript thành Java', () => {
    // Cắt đuôi "js" không được dính vào JavaScript, và so khớp chuỗi con thì
    // "JavaScript".includes("Java") sẽ làm hệ thống im lặng về việc thiếu Java.
    expect(normaliseSkill('JavaScript')).not.toBe(normaliseSkill('Java'));
  });

  test('không cắt đuôi của tên quá ngắn', () => {
    expect(normaliseSkill('JS')).toBe('js');
  });

  test('bỏ khoảng trắng, dấu chấm, gạch dưới, gạch ngang', () => {
    expect(normaliseSkill('Spring  Boot')).toBe(normaliseSkill('spring-boot'));
    expect(normaliseSkill('Tailwind_CSS')).toBe(normaliseSkill('Tailwind CSS'));
  });
});

describe('recurringGaps', () => {
  test('KHÔNG báo kỹ năng mà hồ sơ đã có dù viết khác dạng', () => {
    // Lỗi thật đã gặp khi chạy thử: hệ thống khuyên một lập trình viên React
    // đi "Học React", vì hồ sơ ghi "ReactJS" còn tag của tin ghi "React".
    const gaps = recurringGaps([job('React'), job('React')], ['ReactJS']);
    expect(gaps).toEqual([]);
  });

  test('đếm theo số TIN, không theo số lần xuất hiện', () => {
    // Một tag lặp lại trong cùng một tin không làm nó thành nhu cầu thị trường.
    const gaps = recurringGaps([job('GraphQL', 'GraphQL', 'GraphQL')], []);
    expect(gaps[0]).toEqual({ skill: 'GraphQL', jobCount: 1 });
  });

  test('sắp theo số tin giảm dần', () => {
    const gaps = recurringGaps(
      [job('GraphQL', 'Kafka'), job('GraphQL'), job('GraphQL')],
      [],
    );
    expect(gaps[0].skill).toBe('GraphQL');
    expect(gaps[0].jobCount).toBe(3);
    expect(gaps[1].skill).toBe('Kafka');
  });

  test('giữ nguyên cách viết của tin tuyển dụng khi hiện ra', () => {
    // Người dùng đọc "GraphQL", không phải "graphql".
    expect(recurringGaps([job('GraphQL')], [])[0].skill).toBe('GraphQL');
  });

  test('gộp các cách viết khác nhau của cùng một công nghệ', () => {
    const gaps = recurringGaps(
      [job('NodeJS'), job('Node.js'), job('node')],
      [],
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].jobCount).toBe(3);
  });

  test('bỏ qua cả kỹ năng chính lẫn kỹ năng phụ', () => {
    const gaps = recurringGaps(
      [job('React', 'NodeJS', 'Kafka')],
      ['React', 'NodeJS'],
    );
    expect(gaps.map((gap) => gap.skill)).toEqual(['Kafka']);
  });

  test('giới hạn số kết quả trả về', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(recurringGaps([job(...tags)], [], 3)).toHaveLength(3);
  });

  test('không có tin nào thì trả mảng rỗng', () => {
    expect(recurringGaps([], ['React'])).toEqual([]);
  });

  test('bỏ qua tag rỗng', () => {
    expect(recurringGaps([job('', '  ')], [])).toEqual([]);
  });
});
