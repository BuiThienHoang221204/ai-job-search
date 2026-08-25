import { Injectable, Logger } from '@nestjs/common';
import type {
  JobRequirement,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MIN_COMPLETION_TO_SCORE } from '../../scraper/fan-out.js';
import { matchRequirements, type MatchProfile } from '../requirement-match.js';
import { JobRequirementsService } from './job-requirements.service.js';
import { SkillDictionaryService } from './skill-dictionary.service.js';

/** Bảng nhân theo (số người × số tin) nên cặp không khớp gì thì không ghi. */
const MIN_MET_TO_STORE = 1;

const profileSelect = {
  userId: true,
  headline: true,
  primarySkills: true,
  secondarySkills: true,
  citizenship: true,
  workPermit: true,
  location: true,
  willingToRelocate: true,
  experiences: true,
  updatedAt: true,
} satisfies Prisma.ProfileSelect;

type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof profileSelect }>;

type Candidate = {
  userId: string;
  profile: MatchProfile;
  stamp: string;
};

const toCandidate = (row: ProfileRow): Candidate => ({
  userId: row.userId,
  profile: JobRequirementsService.toMatchProfile(row),
  stamp: row.updatedAt.toISOString(),
});

const pairKey = (userId: string, jobId: string) => `${userId}::${jobId}`;

/**
 * Đối chiếu hồ sơ với yêu cầu đã rút, rồi LƯU kết quả xuống database.
 *
 * Việc lưu mới là điểm mấu chốt: trước đây điểm được tính lại trong bộ nhớ cho
 * đúng 20 tin của trang đang mở, nên không lọc được "khớp từ 50%" bằng SQL.
 */
@Injectable()
export class RequirementMatchService {
  private readonly logger = new Logger(RequirementMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SkillDictionaryService,
  ) {}

  /**
   * Đổi một trong BA đầu vào là phải tính lại.
   *
   * `dictionarySize` là đầu vào thứ ba và dễ quên nhất: danh bạ dày lên thì
   * `Y tá` bỗng khớp `Điều dưỡng`, nhưng nếu vân tay không đổi thì mọi cặp đã
   * tính vẫn giữ kết quả cũ và cả giai đoạn 2 thành vô hình.
   */
  private fingerprint(
    requirement: JobRequirement,
    stamp: string,
    dictionarySize: number,
  ): string {
    return `${requirement.sourceHash ?? requirement.jobId}:${stamp}:d${dictionarySize}`;
  }

  private async candidates(userId?: string): Promise<Candidate[]> {
    const rows = await this.prisma.profile.findMany({
      where: userId
        ? { userId }
        : { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: profileSelect,
    });
    return rows.map(toCandidate);
  }

  private async requirements(jobId?: string): Promise<JobRequirement[]> {
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

  /**
   * Ghi phần ĐÃ ĐỔI, không xoá sạch rồi chèn lại: chạy lại trên dữ liệu không
   * đổi là chuyện mỗi đêm, và xoá sạch biến nó thành hàng nghìn lượt ghi.
   */
  private async apply(
    requirements: JobRequirement[],
    candidates: Candidate[],
  ): Promise<number> {
    if (!requirements.length || !candidates.length) return 0;

    const [known, dictionary] = await Promise.all([
      this.existingHashes(requirements, candidates),
      this.dictionary.lookup(),
    ]);
    const fresh: Prisma.JobRequirementMatchCreateManyInput[] = [];
    const stale: { userId: string; jobId: string }[] = [];

    for (const requirement of requirements) {
      const parsed = JobRequirementsService.toRequirements(requirement);

      for (const candidate of candidates) {
        const hash = this.fingerprint(
          requirement,
          candidate.stamp,
          dictionary.size,
        );
        const key = pairKey(candidate.userId, requirement.jobId);
        if (known.get(key) === hash) continue;

        const result = matchRequirements(parsed, candidate.profile, dictionary);
        if (result.met < MIN_MET_TO_STORE) {
          if (known.has(key)) {
            stale.push({ userId: candidate.userId, jobId: requirement.jobId });
          }
          continue;
        }

        fresh.push({
          userId: candidate.userId,
          jobId: requirement.jobId,
          met: result.met,
          total: result.total,
          percent: result.score,
          eligibility: result.eligibility,
          locationPass:
            result.checks.find((check) => check.kind === 'LOCATION')?.met ??
            null,
          hash,
        });
      }
    }

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
