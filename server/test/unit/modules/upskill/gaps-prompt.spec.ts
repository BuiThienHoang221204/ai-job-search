import type { JobRequirement } from 'src/generated/prisma/client.js';
import {
  gapsPrompt,
  jobFacts,
  RAW_DESCRIPTION_CHARS,
  type ScoredJob,
} from 'src/modules/upskill/utils/upskill.prompt.js';

const DESCRIPTION = `Công ty ABC là đơn vị hàng đầu. ${'x'.repeat(2_000)}`;

const requirements = (
  overrides: Partial<JobRequirement> = {},
): JobRequirement =>
  ({
    jobId: 'job-1',
    status: 'DONE',
    requiredSkills: ['Kế toán tổng hợp', 'Misa'],
    niceToHaveSkills: ['Tiếng Anh'],
    minYears: 2,
    seniority: 'MIDDLE',
    citizenshipRequired: null,
    workPermitRequired: false,
    eligibilityQuote: null,
    city: null,
    remotePolicy: 'UNKNOWN',
    sourceHash: 'hash',
    modelId: null,
    extractedAt: null,
    error: null,
    ...overrides,
  }) as JobRequirement;

const job = (overrides: Partial<ScoredJob['job']> = {}): ScoredJob['job'] => ({
  title: 'Kế toán tổng hợp',
  company: 'Công ty ABC',
  tags: ['kế toán'],
  description: DESCRIPTION,
  requirements: null,
  ...overrides,
});

describe('jobFacts — dùng yêu cầu đã rút, lùi về mô tả thô khi chưa có', () => {
  test('có requirements DONE thì KHÔNG gửi mô tả thô nữa', () => {
    const lines = jobFacts(job({ requirements: requirements() }));
    const text = lines.join('\n');

    expect(text).toContain('Kế toán tổng hợp, Misa');
    expect(text).toContain('Tiếng Anh');
    expect(text).toContain('2 năm');
    expect(text).toContain('MIDDLE');
    expect(text).not.toContain('trích mô tả');
  });

  test('chưa có requirements thì lùi về mô tả thô, cắt đúng trần', () => {
    const lines = jobFacts(job());

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('trích mô tả');
    expect(lines[0]).toContain(DESCRIPTION.slice(0, RAW_DESCRIPTION_CHARS));
    expect(lines[0]).not.toContain(DESCRIPTION.slice(0, 601));
  });

  /*
   * Bản ghi PENDING/FAILED VẪN tồn tại với mảng kỹ năng rỗng. Chỉ kiểm khác null
   * là gửi cho model một khối trống mà không có gì báo - tin đó biến mất khỏi
   * phân tích trong im lặng.
   */
  test.each(['PENDING', 'RUNNING', 'FAILED'] as const)(
    'requirements ở trạng thái %s thì vẫn lùi về mô tả thô',
    (status) => {
      const lines = jobFacts(
        job({ requirements: requirements({ status, requiredSkills: [] }) }),
      );

      expect(lines[0]).toContain('trích mô tả');
    },
  );

  test('DONE nhưng rút ra 0 kỹ năng cũng lùi về mô tả thô', () => {
    const lines = jobFacts(
      job({ requirements: requirements({ requiredSkills: [] }) }),
    );

    expect(lines[0]).toContain('trích mô tả');
  });

  test('không có kỹ năng ưu tiên thì bỏ hẳn dòng đó', () => {
    const lines = jobFacts(
      job({ requirements: requirements({ niceToHaveSkills: [] }) }),
    );

    expect(lines.join('\n')).not.toContain('ưu tiên:');
  });
});

describe('gapsPrompt', () => {
  const match = (overrides: Partial<ScoredJob> = {}): ScoredJob => ({
    overallScore: 40,
    gaps: [],
    job: job(),
    ...overrides,
  });

  test('prompt ngắn hẳn khi mọi tin đều đã rút yêu cầu', () => {
    const matches = Array.from({ length: 10 }, () =>
      match({ job: job({ requirements: requirements() }) }),
    );
    const raw = Array.from({ length: 10 }, () => match());

    const withRequirements = gapsPrompt('khung', 'hồ sơ', matches).prompt;
    const withRaw = gapsPrompt('khung', 'hồ sơ', raw).prompt;

    expect(withRequirements.length).toBeLessThan(withRaw.length / 2);
  });

  /// Trọng số phải khớp đúng luật trong system prompt: (100 - điểm) / 100.
  test('trọng số gap tính từ điểm phù hợp', () => {
    const { prompt } = gapsPrompt('khung', 'hồ sơ', [
      match({ overallScore: 40 }),
    ]);

    expect(prompt).toContain('điểm phù hợp: 40/100, trọng số gap: 0.60');
  });

  test('chưa chấm điểm thì coi như 0, không phải bỏ qua', () => {
    const { prompt } = gapsPrompt('khung', 'hồ sơ', [
      match({ overallScore: null }),
    ]);

    expect(prompt).toContain('điểm phù hợp: 0/100, trọng số gap: 1.00');
  });
});
