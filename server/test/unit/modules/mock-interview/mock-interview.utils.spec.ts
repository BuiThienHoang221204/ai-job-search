import {
  closingOf,
  formatInterviewDossier,
  projectNames,
  recentExperiences,
  type InterviewDossier,
} from 'src/modules/mock-interview/utils/mock-interview.js';

describe('closingOf', () => {
  test('buổi DONE lấy result.text làm tổng kết', () => {
    expect(closingOf('DONE', { text: '  Tổng kết buổi.  ' })).toBe(
      'Tổng kết buổi.',
    );
  });

  test('buổi chưa xong hoặc chưa có tổng kết thì trả null', () => {
    expect(closingOf('WAITING_USER', { text: 'Tổng kết' })).toBeNull();
    expect(closingOf('DONE', { text: '   ' })).toBeNull();
    expect(closingOf('DONE', null)).toBeNull();
  });
});

describe('formatInterviewDossier', () => {
  const dossier = (
    overrides: Partial<InterviewDossier> = {},
  ): InterviewDossier => ({
    job: {
      title: 'Backend Developer',
      company: 'ACME',
      location: null,
      description: 'Mô tả',
    },
    application: null,
    documents: [],
    prep: null,
    match: null,
    requirement: null,
    candidate: null,
    ...overrides,
  });

  test('ghi yêu cầu kinh nghiệm và tóm tắt hồ sơ, bỏ mục kinh nghiệm sai hình dạng', () => {
    const text = formatInterviewDossier(
      dossier({
        requirement: { seniority: 'SENIOR', minYears: 4 },
        candidate: {
          headline: 'Full Stack Developer',
          skills: ['NestJS', 'React'],
          experiences: recentExperiences([
            {
              position: 'Developer',
              company: 'ATOM',
              period: '2023 - nay',
              highlights: ['Làm hệ thống thanh toán', 'Ý thứ hai', 'Ý thứ ba'],
            },
            { company: 'Thiếu chức danh' },
          ]),
          projects: projectNames([{ name: 'Hermes Metrics' }, { foo: 1 }]),
        },
      }),
    );

    expect(text).toContain('Yêu cầu kinh nghiệm: tối thiểu 4 năm, cấp Senior');
    expect(text).toContain('Kỹ năng chính: NestJS, React');
    expect(text).toContain('- Developer · ATOM (2023 - nay)');
    expect(text).toContain('Ý thứ hai');
    expect(text).not.toContain('Ý thứ ba');
    expect(text).not.toContain('Thiếu chức danh');
    expect(text).toContain('Dự án: Hermes Metrics');
  });
});
