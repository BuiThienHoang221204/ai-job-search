import type { Profile } from 'src/generated/prisma/client.js';
import { PromptBuilderService } from 'src/modules/skills/services/prompt-builder.service.js';

const service = new PromptBuilderService();

/// Hồ sơ tối thiểu. Chỉ đặt các trường từng test quan tâm; phần còn lại được
/// ép kiểu vì PromptBuilderService chỉ đọc chứ không ghi.
const profileOf = (overrides: Partial<Profile>): Profile =>
  ({
    primarySkills: [],
    secondarySkills: [],
    lackingSkills: [],
    directExperienceDomains: [],
    adjacentExperience: [],
    careerGoals: [],
    energizingTasks: [],
    drainingTasks: [],
    targetSectors: [],
    dealBreakers: [],
    languages: [],
    willingToRelocate: false,
    ...overrides,
  }) as Profile;

const NOT_PROVIDED = '(hồ sơ chưa cung cấp thông tin này)';

describe('render - thay placeholder', () => {
  test('thay token đã có ánh xạ bằng dữ liệu hồ sơ', () => {
    const output = service.render(
      'Kỹ năng chính: [YOUR_PRIMARY_SKILLS]',
      profileOf({ primarySkills: ['React', 'Next.js'] }),
    );
    expect(output).toBe('Kỹ năng chính: React, Next.js');
  });

  test('token KHÔNG có ánh xạ cũng bị thay, không để lại nguyên văn', () => {
    // Để lại chuỗi "[SOME_UNKNOWN_TOKEN]" trong prompt là nguy hiểm: model sẽ
    // coi đó là dữ liệu thật và bịa nội dung xung quanh nó.
    const output = service.render(
      'Giá trị: [SOME_UNKNOWN_TOKEN]',
      profileOf({}),
    );
    expect(output).toBe(`Giá trị: ${NOT_PROVIDED}`);
    expect(output).not.toContain('[');
  });

  test('mảng rỗng trả về NOT_PROVIDED chứ không phải chuỗi rỗng', () => {
    expect(
      service.render('[YOUR_PRIMARY_SKILLS]', profileOf({ primarySkills: [] })),
    ).toBe(NOT_PROVIDED);
  });

  test('hồ sơ null vẫn render được', () => {
    expect(service.render('[YOUR_CITY]', null)).toBe(NOT_PROVIDED);
  });

  test('goal thứ 2 và 3 lấy đúng phần tử trong mảng', () => {
    const profile = profileOf({
      careerGoals: ['Tech Lead', 'Design system', 'Mentor'],
    });
    expect(service.render('[YOUR_CAREER_GOAL_2]', profile)).toBe(
      'Design system',
    );
    expect(service.render('[YOUR_CAREER_GOAL_3]', profile)).toBe('Mentor');
  });

  test('goal không tồn tại trả NOT_PROVIDED', () => {
    expect(
      service.render('[YOUR_CAREER_GOAL_3]', profileOf({ careerGoals: ['A'] })),
    ).toBe(NOT_PROVIDED);
  });

  test('không đụng đến chữ thường hay từ ngắn', () => {
    // Regex chỉ bắt token VIẾT HOA từ 3 ký tự trở lên, tránh nuốt [a] hay [OK].
    const output = service.render('Xem [1] và [ab] và [OK]', profileOf({}));
    expect(output).toBe('Xem [1] và [ab] và [OK]');
  });
});

describe('keepSections - chỉ giữ mục cần thiết', () => {
  const markdown = [
    '# Tiêu đề',
    'Đoạn mở đầu.',
    '',
    '## Eligibility Gate',
    'Nội dung cổng kiểm tra.',
    '',
    '## Scoring Dimensions',
    'Năm chiều chấm điểm.',
    '',
    '## Output Format',
    'In ra bảng markdown với cột Dimension và Score.',
    '',
    '## Weighting',
    'Kỹ thuật 30%.',
  ].join('\n');

  test('giữ đúng các mục được yêu cầu', () => {
    const output = service.keepSections(markdown, [
      'eligibility gate',
      'weighting',
    ]);
    expect(output).toContain('Nội dung cổng kiểm tra');
    expect(output).toContain('Kỹ thuật 30%');
  });

  test('BỎ mục Output Format - đây là lý do hàm này tồn tại', () => {
    // Mục này ra lệnh in bảng markdown, đánh nhau trực tiếp với JSON schema
    // và làm model trả về sai định dạng.
    const output = service.keepSections(markdown, [
      'eligibility gate',
      'scoring dimensions',
    ]);
    expect(output).not.toContain('Output Format');
    expect(output).not.toContain('In ra bảng markdown');
  });

  test('bỏ cả phần mở đầu trước mục ## đầu tiên', () => {
    const output = service.keepSections(markdown, ['eligibility gate']);
    expect(output).not.toContain('Đoạn mở đầu');
  });

  test('so khớp không phân biệt hoa thường', () => {
    expect(service.keepSections(markdown, ['ELIGIBILITY GATE'])).toContain(
      'Nội dung cổng kiểm tra',
    );
  });

  test('yêu cầu mục không tồn tại trả chuỗi rỗng', () => {
    expect(service.keepSections(markdown, ['không-có-mục-này'])).toBe('');
  });

  test('markdown rỗng trả chuỗi rỗng', () => {
    expect(service.keepSections('', ['bất kỳ'])).toBe('');
  });
});

describe('dropSubsection', () => {
  const markdown = [
    '## Scoring Dimensions',
    '### 1. Technical Skills',
    'Chấm 0-100.',
    '',
    '### 6. Salary Benchmark',
    'Chạy python salary_lookup.py.',
    '',
    '## Weighting',
    'Kỹ thuật 30%.',
  ].join('\n');

  test('bỏ đúng mục con được chỉ định', () => {
    const output = service.dropSubsection(markdown, 'Salary Benchmark');
    expect(output).not.toContain('salary_lookup.py');
  });

  test('giữ nguyên các mục con khác', () => {
    const output = service.dropSubsection(markdown, 'Salary Benchmark');
    expect(output).toContain('Technical Skills');
    expect(output).toContain('Kỹ thuật 30%');
  });
});

describe('profileSummary', () => {
  test('bỏ qua trường rỗng thay vì in dòng trống', () => {
    const output = service.profileSummary(
      profileOf({
        headline: 'Frontend Engineer',
        location: null,
        primarySkills: [],
      }),
    );
    expect(output).toContain('Chức danh: Frontend Engineer');
    expect(output).not.toContain('Địa điểm:');
    expect(output).not.toContain('Kỹ năng chính:');
  });

  test('hồ sơ null trả câu báo thiếu dữ liệu', () => {
    expect(service.profileSummary(null)).toBe(
      'Ứng viên chưa hoàn thiện hồ sơ.',
    );
  });

  /**
   * Dự án và chứng chỉ là bằng chứng ngang hàng với kinh nghiệm, và cả hai từng
   * bị bỏ khỏi tóm tắt dù đã được đọc từ CV rồi lưu vào `Profile`.
   *
   * Đây là hàm DUY NHẤT mọi tác vụ AI đi qua để biết ứng viên là ai, nên thiếu
   * một khối ở đây là thiếu ở chấm điểm, viết CV, viết thư, viết mail, chuẩn bị
   * phỏng vấn và báo cáo lộ trình học - cùng một lúc, và không có gì báo lỗi.
   */
  test('đưa dự án và chứng chỉ vào tóm tắt', () => {
    const output = service.profileSummary(
      profileOf({
        projects: [
          { name: 'MCP Server', technologies: ['MongoDB Vector Search'] },
        ],
        certificates: [{ name: 'AWS Solutions Architect', year: '2025' }],
      }),
    );

    expect(output).toContain('Dự án (JSON):');
    expect(output).toContain('MCP Server');
    expect(output).toContain('MongoDB Vector Search');
    expect(output).toContain('Chứng chỉ (JSON):');
    expect(output).toContain('AWS Solutions Architect');
  });

  test('hồ sơ không có dự án thì không in dòng rỗng', () => {
    const output = service.profileSummary(profileOf({ projects: null }));

    expect(output).not.toContain('Dự án');
    expect(output).not.toContain('Chứng chỉ');
  });

  test('luôn nêu rõ có sẵn sàng chuyển nơi ở hay không', () => {
    expect(
      service.profileSummary(profileOf({ willingToRelocate: false })),
    ).toContain('Sẵn sàng chuyển nơi ở: không');
    expect(
      service.profileSummary(profileOf({ willingToRelocate: true })),
    ).toContain('Sẵn sàng chuyển nơi ở: có');
  });
});
