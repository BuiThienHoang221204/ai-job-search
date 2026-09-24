import type { JobRequirements } from 'src/modules/matching/ai/schemas/job-requirements.schema.js';
import { matchRequirements } from 'src/modules/matching/rules/requirement-match.js';
import type { MatchProfile } from 'src/modules/matching/rules/types.js';
import { planShortlist } from 'src/modules/matching/rules/ai-shortlist.js';
import type { ShortlistRow } from 'src/modules/matching/rules/types.js';

const requirements = (
  overrides: Partial<JobRequirements> = {},
): JobRequirements => ({
  requiredSkills: [],
  niceToHaveSkills: [],
  minYears: null,
  seniority: 'MIDDLE',
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: '',
  city: null,
  remotePolicy: 'UNKNOWN',
  ...overrides,
});

const profile = (overrides: Partial<MatchProfile> = {}): MatchProfile => ({
  skills: [],
  citizenship: 'Việt Nam',
  workPermit: null,
  location: 'Hà Nội',
  willingToRelocate: false,
  years: null,
  ...overrides,
});

const skills = (count: number, prefix = 'S') =>
  Array.from({ length: count }, (_, at) => `${prefix}${at}`);

const rankOf = (required: string[], owned: string[]) =>
  matchRequirements(
    requirements({ requiredSkills: required }),
    profile({ skills: owned }),
  ).rank;

describe('rank của matchRequirements', () => {
  test('tin một yêu cầu khớp hết vẫn xếp dưới tin tám yêu cầu khớp hết', () => {
    const thin = rankOf(skills(1), skills(1));
    const thick = rankOf(skills(8), skills(8));

    expect(thin).toBeLessThan(thick);
  });

  test('cùng khớp hết thì càng nhiều yêu cầu càng cao', () => {
    expect(rankOf(skills(3), skills(3))).toBeLessThan(
      rankOf(skills(5), skills(5)),
    );
  });

  test('score bằng nhau nhưng rank không bằng nhau', () => {
    const thin = matchRequirements(
      requirements({ requiredSkills: skills(1) }),
      profile({ skills: skills(1) }),
    );
    const thick = matchRequirements(
      requirements({ requiredSkills: skills(8) }),
      profile({ skills: skills(8) }),
    );

    expect(thin.score).toBe(thick.score);
    expect(thin.rank).not.toBe(thick.rank);
  });

  test('tin mười một trên mười hai xếp trên tin ba trên ba', () => {
    const many = rankOf(skills(12), skills(11));
    const few = rankOf(skills(3), skills(3));

    expect(many).toBeGreaterThan(few);
  });

  test('eligibility FAIL thì rank về 0 dù khớp hết kỹ năng', () => {
    const result = matchRequirements(
      requirements({
        requiredSkills: skills(8),
        citizenshipRequired: 'Nhật Bản',
      }),
      profile({ skills: skills(8) }),
    );

    expect(result.eligibility).toBe('FAIL');
    expect(result.rank).toBe(0);
  });

  test('không có yêu cầu nào đối chiếu được thì rank là 0', () => {
    expect(rankOf([], [])).toBe(0);
  });
});

describe('planShortlist', () => {
  const rows = (...pairs: [string, string, number][]): ShortlistRow[] =>
    pairs.map(([userId, jobId, rank]) => ({ userId, jobId, rank }));

  const never = new Map<string, Date | null>();

  test('mỗi người nhận đúng topN tin đầu', () => {
    const plan = planShortlist({
      rows: rows(
        ['u1', 'j1', 0.9],
        ['u1', 'j2', 0.8],
        ['u1', 'j3', 0.7],
        ['u1', 'j4', 0.6],
      ),
      lastFanOutAt: never,
      topN: 3,
    });

    expect(plan.targets).toHaveLength(3);
    expect(plan.targets.map((row) => row.jobId)).toEqual(['j1', 'j2', 'j3']);
  });

  test('giữ nguyên thứ tự truy vấn đưa vào, không sắp lại', () => {
    const plan = planShortlist({
      rows: rows(['u1', 'jB', 0.5], ['u1', 'jA', 0.5]),
      lastFanOutAt: never,
      topN: 2,
    });

    expect(plan.targets.map((row) => row.jobId)).toEqual(['jB', 'jA']);
  });

  test('chạm trần thì người chưa nhận suất nào được hoãn, không bị cắt lẻ', () => {
    const plan = planShortlist({
      rows: rows(
        ['u1', 'j1', 0.9],
        ['u1', 'j2', 0.8],
        ['u2', 'j3', 0.9],
        ['u2', 'j4', 0.8],
        ['u3', 'j5', 0.9],
      ),
      lastFanOutAt: never,
      topN: 2,
      maxPerRun: 2,
    });

    expect(plan.targets).toHaveLength(2);
    expect(plan.served).toHaveLength(2);
    expect(plan.deferred).toBe(1);
  });

  test('phát theo vòng nên chạm trần ai cũng có suất đầu tiên', () => {
    const plan = planShortlist({
      rows: rows(
        ['u1', 'j1', 0.9],
        ['u1', 'j2', 0.8],
        ['u1', 'j3', 0.7],
        ['u2', 'j4', 0.9],
        ['u2', 'j5', 0.8],
        ['u2', 'j6', 0.7],
      ),
      lastFanOutAt: never,
      topN: 3,
      maxPerRun: 2,
    });

    expect(plan.targets.map((row) => row.userId)).toEqual(['u1', 'u2']);
  });

  test('người lâu chưa được phát đứng trước người vừa được phát', () => {
    const plan = planShortlist({
      rows: rows(['fresh', 'j1', 0.9], ['stale', 'j2', 0.9]),
      lastFanOutAt: new Map<string, Date | null>([
        ['fresh', new Date('2026-09-16T00:00:00Z')],
        ['stale', new Date('2026-01-01T00:00:00Z')],
      ]),
      topN: 1,
      maxPerRun: 1,
    });

    expect(plan.targets).toEqual([{ userId: 'stale', jobId: 'j2' }]);
  });

  test('người chưa từng được phát đứng trước tất cả', () => {
    const plan = planShortlist({
      rows: rows(['served', 'j1', 0.9], ['newcomer', 'j2', 0.9]),
      lastFanOutAt: new Map<string, Date | null>([
        ['served', new Date('2026-01-01T00:00:00Z')],
        ['newcomer', null],
      ]),
      topN: 1,
      maxPerRun: 1,
    });

    expect(plan.targets).toEqual([{ userId: 'newcomer', jobId: 'j2' }]);
  });

  test('chạy hai lần trên cùng đầu vào cho kết quả giống hệt', () => {
    const input = {
      rows: rows(
        ['u2', 'j1', 0.5],
        ['u1', 'j2', 0.5],
        ['u3', 'j3', 0.5],
        ['u1', 'j4', 0.5],
      ),
      lastFanOutAt: never,
      topN: 2,
      maxPerRun: 3,
    };

    expect(planShortlist(input)).toEqual(planShortlist(input));
  });

  test('không có dòng nào thì không phát suất nào', () => {
    const plan = planShortlist({ rows: [], lastFanOutAt: never });

    expect(plan.targets).toHaveLength(0);
    expect(plan.served).toHaveLength(0);
    expect(plan.deferred).toBe(0);
  });
});
