import { buildSuggestions, type SuggestionInput } from './suggestions.js';

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
    expect(card!.description).toContain('3/24');
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
