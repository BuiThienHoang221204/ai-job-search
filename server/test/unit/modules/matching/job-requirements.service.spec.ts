import { JobRequirementsService } from 'src/modules/matching/services/job-requirements.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import { FakeAi } from 'src/testing/fake-ai.js';

type FakeJob = {
  id: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  workMode: string | null;
};

type FakeRequirement = {
  jobId: string;
  status: string;
  sourceHash: string | null;
  error: string | null;
};

const job = (id: string, description = 'x'.repeat(500)): FakeJob => ({
  id,
  title: `Tin ${id}`,
  company: 'Công ty',
  description,
  location: 'Hà Nội',
  workMode: 'ONSITE',
});

function fakePrisma(jobs: FakeJob[], requirements: FakeRequirement[] = []) {
  const rows = new Map(requirements.map((row) => [row.jobId, { ...row }]));

  return {
    job: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(jobs.find((row) => row.id === where.id) ?? null),
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(jobs.filter((row) => where.id.in.includes(row.id))),
    },
    jobRequirement: {
      findUnique: ({ where }: { where: { jobId: string } }) =>
        Promise.resolve(rows.get(where.jobId) ?? null),
      findMany: ({ where }: { where: { jobId: { in: string[] } } }) =>
        Promise.resolve(
          [...rows.values()].filter((row) =>
            where.jobId.in.includes(row.jobId),
          ),
        ),
      upsert: ({
        where,
        create,
      }: {
        where: { jobId: string };
        create: Record<string, unknown>;
      }) => {
        const existing = rows.get(where.jobId);
        const next = existing
          ? { ...existing, status: 'RUNNING', error: null }
          : ({ sourceHash: null, error: null, ...create } as FakeRequirement);
        rows.set(where.jobId, next);
        return Promise.resolve(next);
      },
      update: ({
        where,
        data,
      }: {
        where: { jobId: string };
        data: Record<string, unknown>;
      }) => {
        const next = {
          ...(rows.get(where.jobId) ?? { jobId: where.jobId }),
          ...data,
        } as FakeRequirement;
        rows.set(where.jobId, next);
        return Promise.resolve(next);
      },
    },
    rows,
  };
}

function build(jobs: FakeJob[], requirements: FakeRequirement[] = []) {
  const prisma = fakePrisma(jobs, requirements);
  const ai = new FakeAi();
  const service = new JobRequirementsService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
  );
  return { service, ai, prisma };
}

const batchOf = (indexes: number[]) => ({
  jobs: indexes.map((index) => ({
    index,
    requiredSkills: [`Kỹ năng ${index}`],
  })),
});

describe('JobRequirementsService.extractMany', () => {
  it('gộp cả lô vào MỘT lượt gọi model', async () => {
    const jobs = ['a', 'b', 'c', 'd', 'e'].map((id) => job(id));
    const { service, ai } = build(jobs);
    ai.willReturn(batchOf([1, 2, 3, 4, 5]));

    const results = await service.extractMany(jobs.map((row) => row.id));

    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].purpose).toBe('job.requirements');
    expect(results).toHaveLength(5);
    expect(results.every((row) => row.status === 'DONE')).toBe(true);
  });

  it('đánh số tin trong prompt để model trả về đúng chỗ', async () => {
    const jobs = ['a', 'b'].map((id) => job(id));
    const { service, ai } = build(jobs);
    ai.willReturn(batchOf([1, 2]));

    await service.extractMany(jobs.map((row) => row.id));

    expect(ai.calls[0].prompt).toContain('=== TIN [1] ===');
    expect(ai.calls[0].prompt).toContain('=== TIN [2] ===');
  });

  it('tin đã rút và nội dung chưa đổi thì không vào lô', async () => {
    const jobs = ['a', 'b', 'c'].map((id) => job(id));
    const { service, ai } = build(jobs);
    ai.willReturn(batchOf([1, 2, 3]));
    await service.extractMany(jobs.map((row) => row.id));

    ai.reset();
    ai.willReturn(batchOf([1]));
    const results = await service.extractMany(jobs.map((row) => row.id));

    expect(ai.calls).toHaveLength(0);
    expect(results).toHaveLength(3);
    expect(ai.pending).toBe(1);
  });

  it('tin mô tả quá dài đi đường lẻ, phần còn lại vẫn gộp', async () => {
    const jobs = [job('a'), job('b'), job('c'), job('dai', 'x'.repeat(6_001))];
    const { service, ai } = build(jobs);
    ai.willReturn({ requiredSkills: ['Lẻ'] }, batchOf([1, 2, 3]));

    const results = await service.extractMany(jobs.map((row) => row.id));

    expect(ai.calls).toHaveLength(2);
    expect(results).toHaveLength(4);
    expect(results.every((row) => row.status === 'DONE')).toBe(true);
  });

  it('lô hỏng thì rút lại từng tin một, không mất tin nào', async () => {
    const jobs = ['a', 'b', 'c'].map((id) => job(id));
    const { service, ai } = build(jobs);
    ai.willFail(new Error('model trả sai định dạng'));
    ai.willReturn(
      { requiredSkills: ['A'] },
      { requiredSkills: ['B'] },
      { requiredSkills: ['C'] },
    );

    const results = await service.extractMany(jobs.map((row) => row.id));

    expect(ai.calls).toHaveLength(4);
    expect(results).toHaveLength(3);
    expect(results.every((row) => row.status === 'DONE')).toBe(true);
  });

  it('lô thiếu phần tử thì chỉ tin đó rút lẻ', async () => {
    const jobs = ['a', 'b', 'c'].map((id) => job(id));
    const { service, ai } = build(jobs);
    ai.willReturn(batchOf([1, 3]), { requiredSkills: ['B'] });

    const results = await service.extractMany(jobs.map((row) => row.id));

    expect(ai.calls).toHaveLength(2);
    expect(results).toHaveLength(3);
    expect(results.every((row) => row.status === 'DONE')).toBe(true);
  });

  it('một tin thì gọi thẳng đường lẻ, không dựng lô', async () => {
    const { service, ai } = build([job('a')]);
    ai.willReturn({ requiredSkills: ['A'] });

    await service.extractMany(['a']);

    expect(ai.calls[0].system).not.toContain('=== TIN');
  });

  it('danh sách rỗng thì không gọi model', async () => {
    const { service, ai } = build([]);

    expect(await service.extractMany([])).toEqual([]);
    expect(ai.calls).toHaveLength(0);
  });
});
