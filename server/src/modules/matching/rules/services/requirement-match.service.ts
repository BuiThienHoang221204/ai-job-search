import { Injectable, Logger } from '@nestjs/common';
import type {
  JobRequirement,
  Prisma,
} from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { SkillDictionaryService } from '../../ai/services/skill-dictionary.service.js';
import {
  MIN_COMPLETION_TO_SCORE,
  pairKey,
  planMatchWrites,
  profileSelect,
  toCandidate,
} from '../match-write.js';
import type { Candidate } from '../types.js';

/** Việc LƯU mới là mấu chốt: tính trong bộ nhớ cho 20 tin của trang đang mở thì không lọc "khớp từ 50%" bằng SQL được. */
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

  private requirements(jobId?: string): Promise<JobRequirement[]> {
    return this.prisma.jobRequirement.findMany({
      where: { status: 'DONE', ...(jobId ? { jobId } : {}) },
    });
  }

  /** Chạy sau khi rút xong yêu cầu của một tin vừa quét về. */
  async scoreJob(jobId: string): Promise<number> {
    const [requirements, candidates] = await Promise.all([
      this.requirements(jobId),
      this.candidates(),
    ]);
    return this.apply(requirements, candidates);
  }

  /** Chạy sau khi danh bạ vừa dày lên: mọi cặp đều có thể đã đổi kết quả. */
  async scoreAll(): Promise<number> {
    const [requirements, candidates] = await Promise.all([
      this.requirements(),
      this.candidates(),
    ]);
    return this.apply(requirements, candidates);
  }

  /** Chạy khi hồ sơ được sửa; thiếu nó thì sửa CV xong danh sách vẫn y nguyên. */
  async scoreUser(userId: string): Promise<number> {
    const [requirements, candidates] = await Promise.all([
      this.requirements(),
      this.candidates(userId),
    ]);
    return this.apply(requirements, candidates);
  }

  private async apply(
    requirements: JobRequirement[],
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
    requirements: JobRequirement[],
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

  /** Ghi phần ĐÃ ĐỔI, không xoá sạch rồi chèn lại — chạy lại trên dữ liệu không đổi là chuyện mỗi đêm. */
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
        ? [this.prisma.jobRequirementMatch.createMany({ data: fresh })]
        : []),
    ]);

    this.logger.log(
      `Đối chiếu yêu cầu: ghi ${fresh.length} cặp, bỏ ${stale.length} cặp không còn khớp`,
    );
    return fresh.length;
  }
}
