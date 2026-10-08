import {
  activityStreak,
  buildSuggestions,
  marketSummary,
  normaliseSkill,
  recurringGaps,
  roundedScore,
  weekDays,
  weeklyProgress,
  todayScore,
  type SuggestionInput,
} from 'src/modules/dashboard/dashboard.utils.js';

/// Hỏng thật trước khi sửa: phép kiểm truthy biến điểm trung bình 0 thành null ("chưa có dữ liệu").
describe('roundedScore', () => {
  test('0 vẫn là một điểm số, không phải chưa có dữ liệu', () => {
    expect(roundedScore(0)).toBe(0);
  });

  test('chưa có dữ liệu thì null', () => {
    expect(roundedScore(null)).toBeNull();
    expect(roundedScore(undefined)).toBeNull();
  });

  test('làm tròn số lẻ', () => {
    expect(roundedScore(72.6)).toBe(73);
  });
});

const job = (...skills: string[]) => skills;

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
    const gaps = recurringGaps([job('React'), job('React')], ['ReactJS']);
    expect(gaps).toEqual([]);
  });

  test('đếm theo số TIN, không theo số lần xuất hiện', () => {
    const gaps = recurringGaps(
      [job('GraphQL', 'GraphQL', 'GraphQL'), job('GraphQL')],
      [],
    );
    expect(gaps[0]).toEqual({ skill: 'GraphQL', jobCount: 2 });
  });

  test('bỏ kỹ năng chỉ một tin yêu cầu', () => {
    const gaps = recurringGaps([job('GraphQL', 'Kafka'), job('GraphQL')], []);
    expect(gaps.map((gap) => gap.skill)).toEqual(['GraphQL']);
  });

  test('sắp theo số tin giảm dần', () => {
    const gaps = recurringGaps(
      [job('GraphQL', 'Kafka'), job('GraphQL', 'Kafka'), job('GraphQL')],
      [],
    );
    expect(gaps).toEqual([
      { skill: 'GraphQL', jobCount: 3 },
      { skill: 'Kafka', jobCount: 2 },
    ]);
  });

  test('gộp các cách viết khác nhau của cùng một công nghệ', () => {
    const gaps = recurringGaps(
      [job('NodeJS'), job('Node.js'), job('node')],
      [],
    );
    expect(gaps).toEqual([{ skill: 'NodeJS', jobCount: 3 }]);
  });

  test('bỏ qua cả kỹ năng chính lẫn kỹ năng phụ', () => {
    const gaps = recurringGaps(
      [job('React', 'NodeJS', 'Kafka'), job('React', 'NodeJS', 'Kafka')],
      ['React', 'NodeJS'],
    );
    expect(gaps.map((gap) => gap.skill)).toEqual(['Kafka']);
  });

  test('giới hạn số kết quả trả về', () => {
    const skills = ['a', 'b', 'c', 'd', 'e'];
    expect(recurringGaps([job(...skills), job(...skills)], [], 3)).toHaveLength(
      3,
    );
  });

  test('không có tin nào hoặc kỹ năng rỗng thì trả mảng rỗng', () => {
    expect(recurringGaps([], ['React'])).toEqual([]);
    expect(recurringGaps([job('', '  '), job('', '  ')], [])).toEqual([]);
  });
});

const input = (overrides: Partial<SuggestionInput> = {}): SuggestionInput => ({
  profileCompletion: 100,
  missingProfileFields: [],
  recurringGaps: [],
  totalMatches: 20,
  topMatch: null,
  ineligibleCount: 0,
  ...overrides,
});

describe('thẻ hồ sơ chưa hoàn thiện', () => {
  test('hiện khi thiếu trường, kèm tên trường cụ thể', () => {
    const [card] = buildSuggestions(
      input({
        profileCompletion: 62,
        missingProfileFields: [
          'Kỹ năng chính',
          'Kinh nghiệm làm việc',
          'Học vấn',
        ],
      }),
    );
    expect(card.type).toBe('cv');
    expect(card.title).toContain('62%');
    expect(card.description).toContain('Kỹ năng chính');
  });

  test('chỉ nêu tối đa 3 trường để thẻ không tràn', () => {
    const [card] = buildSuggestions(
      input({
        profileCompletion: 10,
        missingProfileFields: ['A', 'B', 'C', 'D', 'E'],
      }),
    );
    expect(card.description).not.toContain('D');
  });

  test('không hiện khi hồ sơ đầy đủ', () => {
    const cards = buildSuggestions(
      input({ profileCompletion: 100, missingProfileFields: [] }),
    );
    expect(cards.some((card) => card.id === 'profile-incomplete')).toBe(false);
  });
});

describe('thẻ kỹ năng còn thiếu', () => {
  test('hiện khi một kỹ năng lặp lại ở từ 2 tin trở lên', () => {
    const cards = buildSuggestions(
      input({
        recurringGaps: [{ skill: 'GraphQL', jobCount: 3 }],
        totalMatches: 24,
      }),
    );
    const card = cards.find((item) => item.type === 'skill');
    expect(card!.title).toBe('Học GraphQL');
    expect(card!.description).toContain('3 tin trong ngành');
  });

  test('KHÔNG hiện khi chỉ một tin yêu cầu', () => {
    // Một tin đòi Rust không phải là xu hướng thị trường.
    const cards = buildSuggestions(
      input({ recurringGaps: [{ skill: 'Rust', jobCount: 1 }] }),
    );
    expect(cards.some((card) => card.type === 'skill')).toBe(false);
  });

  test('id được chuẩn hóa từ tên kỹ năng', () => {
    const cards = buildSuggestions(
      input({ recurringGaps: [{ skill: 'Spring Boot', jobCount: 4 }] }),
    );
    expect(cards.find((card) => card.type === 'skill')!.id).toBe(
      'skill-spring-boot',
    );
  });
});

describe('thẻ việc nên ứng tuyển sớm', () => {
  const hot = { jobId: 'j1', company: 'FPT Software', score: 92, daysOld: 1 };

  test('hiện khi điểm cao và tin còn mới', () => {
    const cards = buildSuggestions(input({ topMatch: hot }));
    const card = cards.find((item) => item.type === 'apply');
    expect(card!.title).toContain('FPT Software');
    expect(card!.description).toContain('92%');
    expect(card!.href).toBe('/dashboard/jobs/j1');
  });

  test('KHÔNG hiện khi điểm dưới ngưỡng', () => {
    const cards = buildSuggestions(input({ topMatch: { ...hot, score: 84 } }));
    expect(cards.some((card) => card.id === 'apply-j1')).toBe(false);
  });

  test('KHÔNG hiện khi tin đã cũ', () => {
    // Giục "ứng tuyển sớm" về một tin 20 ngày tuổi là sai.
    const cards = buildSuggestions(
      input({ topMatch: { ...hot, daysOld: 20 } }),
    );
    expect(cards.some((card) => card.id === 'apply-j1')).toBe(false);
  });

  test('ngưỡng là 85 điểm và 7 ngày', () => {
    expect(
      buildSuggestions(
        input({ topMatch: { ...hot, score: 85, daysOld: 7 } }),
      ).some((card) => card.id === 'apply-j1'),
    ).toBe(true);
  });
});

describe('thẻ nhiều tin không đủ điều kiện', () => {
  test('hiện khi chiếm từ một phần ba trở lên', () => {
    const cards = buildSuggestions(
      input({ ineligibleCount: 8, totalMatches: 20 }),
    );
    expect(cards.some((card) => card.id === 'ineligible-high')).toBe(true);
  });

  test('KHÔNG hiện khi chỉ là thiểu số', () => {
    const cards = buildSuggestions(
      input({ ineligibleCount: 2, totalMatches: 20 }),
    );
    expect(cards.some((card) => card.id === 'ineligible-high')).toBe(false);
  });

  test('KHÔNG hiện khi chỉ có một tin bị loại', () => {
    const cards = buildSuggestions(
      input({ ineligibleCount: 1, totalMatches: 2 }),
    );
    expect(cards.some((card) => card.id === 'ineligible-high')).toBe(false);
  });
});

describe('trường hợp biên', () => {
  test('người dùng mới tinh nhận được hướng dẫn thay vì màn hình trống', () => {
    const cards = buildSuggestions(
      input({ profileCompletion: 100, totalMatches: 0, recurringGaps: [] }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('no-jobs');
  });

  test('không bao giờ trả quá 4 thẻ', () => {
    const cards = buildSuggestions(
      input({
        profileCompletion: 30,
        missingProfileFields: ['A', 'B'],
        recurringGaps: [{ skill: 'GraphQL', jobCount: 5 }],
        topMatch: { jobId: 'j1', company: 'X', score: 95, daysOld: 0 },
        ineligibleCount: 10,
        totalMatches: 20,
      }),
    );
    expect(cards.length).toBeLessThanOrEqual(4);
  });

  test('mỗi thẻ có id duy nhất', () => {
    const cards = buildSuggestions(
      input({
        profileCompletion: 30,
        missingProfileFields: ['A'],
        recurringGaps: [{ skill: 'GraphQL', jobCount: 5 }],
        topMatch: { jobId: 'j1', company: 'X', score: 95, daysOld: 0 },
      }),
    );
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });
});

describe('todayScore', () => {
  test('trung bình từng trục, bỏ qua lượt chưa có điểm', () => {
    const row = (overall: number | null) => ({
      overallScore: overall,
      technicalScore: 80,
      experienceScore: null,
      behavioralScore: 0,
      careerScore: 61,
    });
    expect(todayScore([row(70), row(null), row(75)])).toEqual({
      overall: 73,
      skills: 80,
      experience: null,
      behavioral: 0,
      career: 61,
      sampleSize: 3,
    });
  });
});

describe('marketSummary', () => {
  test('xếp giảm dần, đổi mã thành tên, bỏ tin chưa phân loại', () => {
    const result = marketSummary(
      [
        { provinceCode: 'HN', _count: 48 },
        { provinceCode: null, _count: 60 },
        { provinceCode: 'HCM', _count: 49 },
      ],
      [
        { subOccupationCode: 'IT_DEVOPS', _count: 14 },
        { subOccupationCode: 'IT_FULLSTACK', _count: 19 },
        { subOccupationCode: null, _count: 30 },
      ],
      'IT',
    );

    expect(result.provinces.map((row) => [row.code, row.count])).toEqual([
      ['HCM', 49],
      ['HN', 48],
    ]);
    expect(result.provinces[1].name).toBe('Hà Nội');
    expect(result.subs.map((row) => row.code)).toEqual([
      'IT_FULLSTACK',
      'IT_DEVOPS',
    ]);
  });

  test('chỉ giữ tối đa 5 mục và bỏ nghề không thuộc ngành', () => {
    const provinces = ['HN', 'HCM', 'DN', 'HP', 'CT', 'BN'].map(
      (code, index) => ({
        provinceCode: code,
        _count: 10 - index,
      }),
    );
    const result = marketSummary(
      provinces,
      [{ subOccupationCode: 'FIN_ACCOUNTING', _count: 9 }],
      'IT',
    );

    expect(result.provinces).toHaveLength(5);
    expect(result.subs).toEqual([]);
  });
});

describe('tiến độ tuần (giờ Việt Nam)', () => {
  const at = (iso: string) => new Date(iso);
  const now = at('2026-10-08T05:00:00Z');

  test('tuần bắt đầu từ thứ Hai', () => {
    expect(weekDays(now)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  test('chỉ đếm việc rơi vào tuần này', () => {
    const progress = weeklyProgress(
      {
        documents: [at('2026-10-06T03:00:00Z'), at('2026-10-02T03:00:00Z')],
        applied: [at('2026-10-08T01:00:00Z')],
        interviews: [],
      },
      now,
    );
    expect(progress.documents).toEqual({ done: 1, goal: 2 });
    expect(progress.applied).toEqual({ done: 1, goal: 2 });
    expect(progress.interviews).toEqual({ done: 0, goal: 1 });
  });

  test('chuỗi ngày liên tiếp, hôm nay chưa làm thì tính từ hôm qua', () => {
    const streak = activityStreak(
      [
        at('2026-10-05T02:00:00Z'),
        at('2026-10-06T02:00:00Z'),
        at('2026-10-07T02:00:00Z'),
      ],
      now,
    );
    expect(streak.days).toBe(3);
    expect(streak.week).toEqual([true, true, true, false, false, false, false]);
  });

  test('đứt chuỗi thì đếm lại', () => {
    expect(activityStreak([at('2026-10-05T02:00:00Z')], now).days).toBe(0);
  });
});
