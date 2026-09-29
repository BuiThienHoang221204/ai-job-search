import type { JobRequirement } from 'src/generated/prisma/client.js';
import { planMatchWrites } from 'src/modules/matching/rules/match-write.js';
import type { Candidate } from 'src/modules/matching/rules/types.js';

const requirement = (overrides: Partial<JobRequirement>): JobRequirement => ({
  jobId: 'job-1',
  status: 'DONE',
  requiredSkills: [],
  niceToHaveSkills: [],
  minYears: null,
  seniority: 'UNKNOWN',
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: null,
  city: null,
  remotePolicy: 'UNKNOWN',
  sourceHash: 'hash-1',
  modelId: null,
  extractedAt: null,
  error: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const itDeveloper: Candidate = {
  userId: 'user-1',
  stamp: '2026-09-28T00:00:00.000Z',
  profile: {
    skills: ['ReactJS', 'NestJS', 'PostgreSQL'],
    citizenship: null,
    workPermit: null,
    location: null,
    willingToRelocate: false,
    years: 2,
  },
};

describe('planMatchWrites', () => {
  test('chỉ khớp số năm thì KHÔNG lưu cặp', () => {
    const { fresh } = planMatchWrites(
      [requirement({ requiredSkills: ['vận hành lò hơi'], minYears: 1 })],
      [itDeveloper],
      new Map(),
      new Map(),
    );

    expect(fresh).toEqual([]);
  });

  test('cặp đã lưu mà nay chỉ còn khớp số năm thì bị đưa vào danh sách bỏ', () => {
    const { fresh, stale } = planMatchWrites(
      [requirement({ minYears: 1 })],
      [itDeveloper],
      new Map(),
      new Map([['user-1::job-1', 'v2:hash-1:old:d0']]),
    );

    expect(fresh).toEqual([]);
    expect(stale).toEqual([{ userId: 'user-1', jobId: 'job-1' }]);
  });

  test('khớp ít nhất một kỹ năng thì lưu', () => {
    const { fresh } = planMatchWrites(
      [requirement({ requiredSkills: ['ReactJS', 'Kubernetes'], minYears: 1 })],
      [itDeveloper],
      new Map(),
      new Map(),
    );

    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ met: 2, total: 3, percent: 67 });
  });
});
