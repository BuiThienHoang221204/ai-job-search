import type { JobRequirement, Prisma } from 'src/generated/prisma/client.js';
import { RequirementMatchService } from 'src/modules/matching/rules/services/requirement-match.service.js';
import type { SkillDictionaryService } from 'src/modules/matching/ai/services/skill-dictionary.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';

const requirement = (index: number): JobRequirement => ({
  jobId: `job-${index}`,
  status: 'DONE',
  requiredSkills: index % 3 === 0 ? ['Kế toán'] : ['NestJS', 'PostgreSQL'],
  niceToHaveSkills: [],
  skillGroups: null,
  minYears: null,
  seniority: 'UNKNOWN',
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: null,
  city: null,
  remotePolicy: 'UNKNOWN',
  sourceHash: `hash-${index}`,
  modelId: null,
  extractedAt: null,
  error: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const profileRow = {
  userId: 'user-1',
  headline: 'Backend Developer',
  primarySkills: ['NestJS', 'PostgreSQL'],
  secondarySkills: [],
  citizenship: null,
  workPermit: null,
  location: null,
  willingToRelocate: false,
  experiences: [],
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

type FindManyArgs = { where: Record<string, unknown> };
type DeleteArgs = { where: Prisma.JobRequirementMatchWhereInput };
type CreateArgs = {
  data: Prisma.JobRequirementMatchCreateManyInput[];
  skipDuplicates?: boolean;
};

function build(
  requirements: JobRequirement[],
  existing: { userId: string; jobId: string; hash: string }[] = [],
) {
  const prisma = {
    profile: { findMany: jest.fn().mockResolvedValue([profileRow]) },
    jobRequirement: {
      findMany: jest
        .fn<Promise<JobRequirement[]>, [FindManyArgs]>()
        .mockResolvedValue(requirements),
    },
    jobRequirementMatch: {
      findMany: jest.fn<Promise<typeof existing>, [FindManyArgs]>((args) => {
        const jobIds = (args.where.jobId as { in: string[] }).in;
        return Promise.resolve(
          existing.filter((row) => jobIds.includes(row.jobId)),
        );
      }),
      deleteMany: jest.fn<DeleteArgs, [DeleteArgs]>((args) => args),
      createMany: jest.fn<CreateArgs, [CreateArgs]>((args) => args),
    },
    $transaction: jest.fn<Promise<unknown[]>, [unknown[]]>((ops) =>
      Promise.resolve(ops),
    ),
  };
  const dictionary = {
    lookup: jest
      .fn()
      .mockResolvedValue({ aliases: new Map(), implies: new Map() }),
  } as unknown as SkillDictionaryService;
  const service = new RequirementMatchService(
    prisma as unknown as PrismaService,
    dictionary,
  );
  return { prisma, service };
}

describe('RequirementMatchService.score theo hồ sơ', () => {
  test('bỏ tin trùng giữa các portal khỏi tập đối chiếu', async () => {
    const { prisma, service } = build([]);

    await service.score({ userId: 'user-1' });

    expect(prisma.jobRequirement.findMany.mock.calls[0][0].where).toEqual({
      status: 'DONE',
      job: { duplicateOfId: null },
    });
  });

  test('hai lượt ghi chồng nhau không vỡ vì trùng khoá', async () => {
    const { prisma, service } = build([requirement(1), requirement(2)]);

    const written = await service.score({ userId: 'user-1' });

    const [[args]] = prisma.jobRequirementMatch.createMany.mock.calls;
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toHaveLength(written);
  });
});
