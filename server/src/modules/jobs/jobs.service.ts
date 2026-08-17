import { Injectable, NotFoundException } from '@nestjs/common';
import type { FitVerdict, MatchStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JobRequirement } from '../../generated/prisma/client.js';
import { JobRequirementsService } from '../matching/job-requirements.service.js';
import {
  matchRequirements,
  type MatchProfile,
} from '../matching/requirement-match.js';
import { keywordOverlap } from '../scraper/fan-out.js';
import type { CreateJobDto, ListJobsQueryDto } from './dto/job.dto.js';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo hoặc cập nhật tin tuyển dụng. */
  async upsert(dto: CreateJobDto) {
    const data = {
      title: dto.title,
      company: dto.company,
      description: dto.description,
      url: dto.url ?? '',
      source: dto.source ?? 'manual',
      externalId: dto.externalId ?? null,
      companyLogo: dto.companyLogo ?? null,
      location: dto.location ?? null,
      workMode: dto.workMode ?? null,
      salaryRaw: dto.salaryRaw ?? null,
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      currency: dto.currency ?? null,
      tags: dto.tags ?? [],
    };

    if (!data.externalId) return this.prisma.job.create({ data });

    return this.prisma.job.upsert({
      where: {
        source_externalId: { source: data.source, externalId: data.externalId },
      },
      create: data,
      update: data,
    });
  }

  /**
   * Quan hệ `saves` đã được lọc sẵn theo userId, nên chỉ cần biết mảng có
   * rỗng hay không. Tách ra thành hàm riêng để logic này chỉ tồn tại ở một
   * chỗ.
   */
  private withSavedFlag<T extends { saves: unknown[] }>(job: T) {
    const { saves, ...rest } = job;
    return { ...rest, saved: saves.length > 0 };
  }

  /**
   * Gắn trạng thái chấm điểm của CHÍNH người dùng đang hỏi vào mỗi tin.
   *
   * Thiếu trường này thì giao diện không có cách nào biết một tin đã có điểm,
   * nên nó luôn mời bấm "Chấm điểm" kể cả khi điểm đã nằm sẵn trong database.
   */
  private withMatchState<
    T extends {
      matches: {
        status: MatchStatus;
        overallScore: number | null;
        verdict: FitVerdict | null;
      }[];
    },
  >(job: T) {
    const { matches, ...rest } = job;
    return { ...rest, match: matches[0] ?? null };
  }

  /** `matches` được lọc theo userId nên nhiều nhất một phần tử. */
  private readonly relations = (userId: string) => ({
    saves: { where: { userId }, select: { id: true } },
    matches: {
      where: { userId },
      select: { status: true, overallScore: true, verdict: true },
    },
    requirements: true,
  });

  /** Hồ sơ rút về đúng những trường việc đối chiếu cần. */
  private async matchProfileOf(userId: string): Promise<MatchProfile | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        primarySkills: true,
        secondarySkills: true,
        citizenship: true,
        workPermit: true,
        location: true,
        willingToRelocate: true,
      },
    });
    return profile ? JobRequirementsService.toMatchProfile(profile) : null;
  }

  /**
   * Đối chiếu hồ sơ với yêu cầu của tin, hoặc lùi về đếm từ khoá khi tin chưa
   * được rút trích.
   *
   * KHÔNG đổi ra phần trăm. Tin liệt kê mọi thứ họ muốn còn hồ sơ chỉ khai vài
   * thứ, nên tỉ lệ luôn bị dìm - đã đo: 2/10 trên một tin AI chấm 80.
   */
  private withSystemMatch<
    T extends {
      title: string;
      description: string;
      requirements: JobRequirement | null;
    },
  >(job: T, profile: MatchProfile | null) {
    const { requirements, ...rest } = job;

    if (!profile) {
      return { ...rest, systemMatch: null };
    }

    if (requirements?.status === 'DONE') {
      const result = matchRequirements(
        JobRequirementsService.toRequirements(requirements),
        profile,
      );
      return {
        ...rest,
        systemMatch: {
          kind: 'REQUIREMENTS' as const,
          met: result.met,
          total: result.total,
          score: result.score,
          eligibility: result.eligibility,
          checks: result.checks,
        },
      };
    }

    return {
      ...rest,
      systemMatch: {
        kind: 'KEYWORDS' as const,
        met: keywordOverlap(`${job.title} ${job.description}`, profile.skills),
        total: profile.skills.length,
        score: 0,
        eligibility: 'UNVERIFIED' as const,
        checks: [],
      },
    };
  }

  async list(query: ListJobsQueryDto, userId: string) {
    const where = query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' as const } },
            { company: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total, skills] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { scrapedAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
        include: this.relations(userId),
      }),
      this.prisma.job.count({ where }),
      this.matchProfileOf(userId),
    ]);

    return {
      items: items.map((job) =>
        this.withSystemMatch(
          this.withMatchState(this.withSavedFlag(job)),
          skills,
        ),
      ),
      total,
    };
  }

  async get(id: string, userId: string) {
    const [job, skills] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id },
        include: this.relations(userId),
      }),
      this.matchProfileOf(userId),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${id}`);
    return this.withSystemMatch(
      this.withMatchState(this.withSavedFlag(job)),
      skills,
    );
  }

  /**
   * Lưu tin. Bấm nút hai lần không được sinh lỗi - dùng upsert thay vì
   * create.
   */
  async save(userId: string, jobId: string) {
    await this.get(jobId, userId);
    await this.prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
    return { saved: true };
  }

  /**
   * Bỏ lưu. Bỏ một tin chưa từng lưu cũng trả về bình thường: nút bấm là một
   * công tắc, không phải một giao dịch.
   */
  async unsave(userId: string, jobId: string) {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: false };
  }

  async listSaved(userId: string) {
    const saves = await this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
      include: { job: true },
    });
    return {
      items: saves.map((save) => ({
        ...save.job,
        saved: true,
        savedAt: save.savedAt,
      })),
      total: saves.length,
    };
  }
}
