import type { RequirementCheck } from 'src/modules/matching/rules/types.js';
import {
  EXCERPT_LENGTH,
  excerptOf,
  toPublicJobDetail,
} from 'src/modules/jobs/utils/public-job.js';

const job = {
  id: 'job-1',
  source: 'topcv',
  url: 'https://example.test/tin-1',
  title: 'Kế toán tổng hợp',
  company: 'Công ty A',
  companyLogo: null,
  location: 'Hà Nội',
  workMode: null,
  tags: [],
  postedAt: null,
  scrapedAt: new Date('2026-10-01'),
  provinceCode: 'HN',
  occupationCode: 'FINANCE',
  description: 'Mô tả ngắn.',
  requirements: null,
};

const requirement = (requiredSkills: string[]) => ({
  jobId: 'job-1',
  status: 'DONE' as const,
  requiredSkills,
  niceToHaveSkills: [],
  skillGroups: null,
  minYears: null,
  seniority: 'UNKNOWN' as const,
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: null,
  city: null,
  remotePolicy: 'UNKNOWN' as const,
  sourceHash: null,
  modelId: null,
  extractedAt: null,
  error: null,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
});

describe('excerptOf', () => {
  test('mô tả ngắn giữ nguyên, chỉ gộp khoảng trắng', () => {
    expect(excerptOf('  Lập   báo cáo\n\nthuế  ')).toBe('Lập báo cáo thuế');
  });

  test('mô tả dài bị cắt ở ranh giới từ và có dấu ba chấm', () => {
    const excerpt = excerptOf('kế toán '.repeat(100));

    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.slice(0, -1).endsWith(' ')).toBe(false);
    expect(['kế', 'toán']).toContain(excerpt.slice(0, -1).split(' ').pop());
  });
});

describe('toPublicJobDetail', () => {
  const dictionary = { aliases: new Map<string, string>(), implies: new Map() };

  test('mô tả chỉ còn đoạn trích', () => {
    const detail = toPublicJobDetail(
      { ...job, description: 'x '.repeat(1000) },
      dictionary,
    );

    expect(detail.description.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1);
  });

  test('chưa rút được yêu cầu thì không có phần đối chiếu', () => {
    const detail = toPublicJobDetail(job, dictionary);

    expect(detail.systemMatch?.total).toBe(0);
  });

  test('yêu cầu đã rút xong thì liệt kê đủ, không kỹ năng nào tính là đáp ứng', () => {
    const detail = toPublicJobDetail(
      { ...job, requirements: requirement(['Excel', 'MISA']) },
      dictionary,
    );

    expect(detail.systemMatch?.kind).toBe('REQUIREMENTS');
    const checks: RequirementCheck[] = detail.systemMatch?.checks ?? [];
    const skills = checks.filter((check) => check.kind === 'SKILL');
    expect(skills.map((check) => check.label)).toEqual(['Excel', 'MISA']);
    expect(skills.every((check) => check.met === false)).toBe(true);
  });
});
