import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SkillDictionaryService } from '@/modules/matching/ai/services/skill-dictionary.service';
import {
  MIN_COMPLETION_TO_SCORE,
  pairKey,
  planMatchWrites,
  profileSelect,
  toCandidate,
  type ScoredRequirement,
} from '../match-write';
import type { Candidate } from '../types';

const JOB_CHUNK = 100;

const PROFILE_CHUNK = 50;

@Injectable()
export class RequirementMatchService {
  private readonly logger = new Logger(RequirementMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SkillDictionaryService,
  ) {}

  private async candidates(userId?: string): Promise<Candidate[]> {
    const rows = await this.prisma.profile.findMany({
      where: userId
        ? { userId }
        : { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: profileSelect,
    });
    return rows.map(toCandidate);
  }

  private requirements(jobId?: string): Promise<ScoredRequirement[]> {
    return this.prisma.jobRequirement.findMany({
      where: {
        status: 'DONE',
        job: { duplicateOfId: null },
        ...(jobId ? { jobId } : {}),
      },
      include: { job: { select: { occupationCode: true } } },
    });
  }

  /** Đối chiếu một tin với mọi hồ sơ, một hồ sơ với mọi tin, hoặc cả kho khi không truyền gì. */
  async score(scope: { jobId?: string; userId?: string }): Promise<number> {
    const [requirements, candidates] = await Promise.all([
      this.requirements(scope.jobId),
      this.candidates(scope.userId),
    ]);
    let written = 0;
    for (let job = 0; job < requirements.length; job += JOB_CHUNK) {
      for (let user = 0; user < candidates.length; user += PROFILE_CHUNK) {
        written += await this.apply(
          requirements.slice(job, job + JOB_CHUNK),
          candidates.slice(user, user + PROFILE_CHUNK),
        );
      }
    }
    return written;
  }

  private async apply(
    requirements: ScoredRequirement[],
    candidates: Candidate[],
  ): Promise<number> {
    if (!requirements.length || !candidates.length) return 0;

    const [known, dictionary] = await Promise.all([
      this.existingHashes(requirements, candidates),
      this.dictionary.lookup(),
    ]);

    const { fresh, stale } = planMatchWrites(
      requirements,
      candidates,
      dictionary,
      known,
    );
    return this.persist(fresh, stale);
  }

  private async existingHashes(
    requirements: ScoredRequirement[],
    candidates: Candidate[],
  ): Promise<Map<string, string>> {
    const rows = await this.prisma.jobRequirementMatch.findMany({
      where: {
        jobId: { in: requirements.map((row) => row.jobId) },
        userId: { in: candidates.map((row) => row.userId) },
      },
      select: { userId: true, jobId: true, hash: true },
    });
    return new Map(
      rows.map((row) => [pairKey(row.userId, row.jobId), row.hash]),
    );
  }

  private async persist(
    fresh: Prisma.JobRequirementMatchCreateManyInput[],
    stale: { userId: string; jobId: string }[],
  ): Promise<number> {
    if (!fresh.length && !stale.length) return 0;

    const drop = [
      ...stale,
      ...fresh.map(({ userId, jobId }) => ({ userId, jobId })),
    ];

    await this.prisma.$transaction([
      this.prisma.jobRequirementMatch.deleteMany({ where: { OR: drop } }),
      ...(fresh.length
        ? [
            this.prisma.jobRequirementMatch.createMany({
              data: fresh,
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    this.logger.log(
      `Đối chiếu yêu cầu: ghi ${fresh.length} cặp, bỏ ${stale.length} cặp không còn khớp`,
    );
    return fresh.length;
  }
}
