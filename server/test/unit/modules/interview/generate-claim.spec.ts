jest.mock('ai', () => ({}));
jest.mock('@ai-sdk/openai-compatible', () => ({}));

import type { MatchStatus } from 'src/generated/prisma/enums.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import type { PromptBuilderService } from 'src/modules/skills/services/prompt-builder.service.js';
import type { SkillRegistryService } from 'src/modules/skills/services/skill-registry.service.js';
import { InterviewService } from 'src/modules/interview/interview.service.js';

type PrepRow = { status: MatchStatus; promptHash: string | null } | null;

function fakes(existing: PrepRow, claimCount: number) {
  const updateMany = jest.fn(() => Promise.resolve({ count: claimCount }));
  const create = jest.fn(() => Promise.resolve({}));
  const generateObject = jest.fn(() =>
    Promise.reject(new Error('không được gọi model')),
  );

  const prisma = {
    profile: { findUnique: jest.fn(() => Promise.resolve(null)) },
    job: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'job-1',
          title: 'Kế toán',
          company: 'Công ty A',
          location: null,
          description: 'Mô tả',
        }),
      ),
    },
    jobMatch: { findUnique: jest.fn(() => Promise.resolve(null)) },
    interviewPrep: {
      findUnique: jest.fn(() => Promise.resolve(existing)),
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({ status: 'RUNNING', jobId: 'job-1' }),
      ),
      updateMany,
      create,
      update: jest.fn(() => Promise.resolve({})),
    },
  } as unknown as PrismaService;

  const skills = {
    get: () => ({ references: new Map<string, string>(), contentHash: 'h' }),
  } as unknown as SkillRegistryService;
  const prompts = {
    render: (template: string) => template,
    keepSections: (markdown: string) => markdown,
    profileSummary: () => '',
  } as unknown as PromptBuilderService;
  const ai = { generateObject } as unknown as AiService;

  const service = new InterviewService(
    prisma,
    ai,
    skills,
    prompts,
    null as never,
  );

  return { service, updateMany, create, generateObject };
}

describe('InterviewService.generate giành chỗ RUNNING', () => {
  it('lượt khác đang RUNNING thì bỏ qua, không gọi model', async () => {
    const { service, updateMany, generateObject } = fakes(
      { status: 'RUNNING', promptHash: null },
      0,
    );

    const prep = await service.generate('user-1', 'job-1', true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', jobId: 'job-1', status: { not: 'RUNNING' } },
      data: { status: 'RUNNING', error: null },
    });
    expect(generateObject).not.toHaveBeenCalled();
    expect(prep).toMatchObject({ status: 'RUNNING' });
  });

  it('giành được chỗ thì mới gọi model', async () => {
    const { service, generateObject } = fakes(
      { status: 'PENDING', promptHash: null },
      1,
    );

    await service.generate('user-1', 'job-1', true);

    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('chưa có bản ghi thì tạo thẳng ở RUNNING', async () => {
    const { service, create, updateMany, generateObject } = fakes(null, 0);

    await service.generate('user-1', 'job-1', false);

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', jobId: 'job-1', status: 'RUNNING' },
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});
