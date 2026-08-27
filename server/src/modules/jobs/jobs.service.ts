import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FitVerdict,
  MatchStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JobRequirement } from '../../generated/prisma/client.js';
import { JobRequirementsService } from '../matching/services/job-requirements.service.js';
import { SkillDictionaryService } from '../matching/services/skill-dictionary.service.js';
import {
  matchRequirements,
  type MatchProfile,
  type SkillDictionary,
} from '../matching/requirement-match.js';
import { keywordOverlap } from '../scraper/fan-out.js';
import { derivedFields } from './taxonomy/derived.js';
import { jobCardSelect } from './job-card.select.js';
import { OCCUPATIONS } from './taxonomy/occupations.js';
import { SUB_OCCUPATIONS } from './taxonomy/sub-occupations.js';
import { PROVINCES, REMOTE_CODE } from './taxonomy/provinces.js';
import { normalizeText } from './taxonomy/resolve.js';
import type { CreateJobDto, JobSort, ListJobsQueryDto } from './job.dto.js';

const MATCH_STATE_FIELDS = {
  status: true,
  overallScore: true,
  verdict: true,
} satisfies Prisma.JobMatchSelect;

const MATCH_DETAIL_FIELDS = {
  ...MATCH_STATE_FIELDS,
  jobId: true,
  eligibility: true,
  eligibilityNote: true,
  technicalScore: true,
  experienceScore: true,
  strengths: true,
  gaps: true,
  evaluatedAt: true,
} satisfies Prisma.JobMatchSelect;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly dictionary: SkillDictionaryService,
  ) {}
  private get minPercent(): number {
    return this.config.get<number>('matching.minPercent') ?? 50;
  }
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
      ...derivedFields(dto.title, dto.company, dto.location, dto.tags ?? []),
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
  private withSavedFlag<T extends { saves: unknown[] }>(job: T) {
    const { saves, ...rest } = job;
    return { ...rest, saved: saves.length > 0 };
  }
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
  private withMatchDetail<
    T extends {
      matches: { evaluatedAt: Date | null }[];
    },
  >(job: T, profileUpdatedAt: Date | null) {
    const { matches, ...rest } = job;
    const match = matches[0];
    if (!match) return { ...rest, match: null };

    const stale =
      profileUpdatedAt !== null &&
      match.evaluatedAt !== null &&
      match.evaluatedAt < profileUpdatedAt;
    return { ...rest, match: { ...match, stale } };
  }
  private async profileUpdatedAt(userId: string): Promise<Date | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    return profile?.updatedAt ?? null;
  }
  private readonly relations = (userId: string) => ({
    saves: { where: { userId }, select: { id: true } },
    matches: { where: { userId }, select: MATCH_DETAIL_FIELDS },
    requirements: true,
  });
  private async matchProfileOf(userId: string): Promise<MatchProfile | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        headline: true,
        primarySkills: true,
        secondarySkills: true,
        citizenship: true,
        workPermit: true,
        location: true,
        willingToRelocate: true,
        experiences: true,
      },
    });
    return profile ? JobRequirementsService.toMatchProfile(profile) : null;
  }
  private withSystemMatch<
    T extends {
      title: string;
      tags: string[];
      requirements: JobRequirement | null;
    },
  >(job: T, profile: MatchProfile | null, dictionary: SkillDictionary) {
    const { requirements, ...rest } = job;

    if (!profile) {
      return { ...rest, systemMatch: null };
    }

    if (requirements?.status === 'DONE') {
      const result = matchRequirements(
        JobRequirementsService.toRequirements(requirements),
        profile,
        dictionary,
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
        met: keywordOverlap(
          `${job.title} ${job.tags.join(' ')}`,
          profile.skills,
        ),
        total: profile.skills.length,
        score: 0,
        eligibility: 'UNVERIFIED' as const,
        checks: [],
      },
    };
  }
  private whereFrom(
    query: ListJobsQueryDto,
    userId: string,
  ): Prisma.JobWhereInput {
    const needle = query.q ? normalizeText(query.q) : '';
    const since = query.postedWithin
      ? new Date(Date.now() - query.postedWithin * 24 * 60 * 60 * 1000)
      : null;

    return {
      duplicateOfId: null,
      ...(needle ? { searchText: { contains: needle } } : {}),
      ...(query.province?.length
        ? { provinceCode: { in: query.province } }
        : {}),
      ...(query.occupation?.length
        ? { occupationCode: { in: query.occupation } }
        : {}),
      ...(query.subOccupation?.length
        ? { subOccupationCode: { in: query.subOccupation } }
        : {}),
      ...(query.workMode?.length ? { workMode: { in: query.workMode } } : {}),
      ...(query.salaryMin ? { salaryMax: { gte: query.salaryMin } } : {}),
      ...(since ? { postedAt: { gte: since } } : {}),
      ...(query.scored
        ? {
            skillMatches: {
              some: { userId, percent: { gte: this.minPercent } },
            },
          }
        : {}),
      ...(query.saved ? { saves: { some: { userId } } } : {}),
      ...(query.applied ? { applications: { some: { userId } } } : {}),
    };
  }
  private orderFor(sort: JobSort): Prisma.JobOrderByWithRelationInput[] {
    if (sort === 'salary') {
      return [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    }
    return [{ scrapedAt: 'desc' }, { id: 'desc' }];
  }
  private readonly cardSelect = (userId: string) =>
    ({
      ...jobCardSelect(userId),
      matches: { where: { userId }, select: MATCH_STATE_FIELDS },
      requirements: true,
    }) satisfies Prisma.JobSelect;

  async list(query: ListJobsQueryDto, userId: string) {
    const where = this.whereFrom(query, userId);
    const sort = query.sort ?? 'newest';

    if (sort === 'match') return this.listByMatchScore(where, query, userId);

    const [rows, total, profile, dictionary] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: this.orderFor(sort),
        ...pageArgs(query),
        select: this.cardSelect(userId),
      }),
      this.prisma.job.count({ where }),
      this.matchProfileOf(userId),
      this.dictionary.lookup(),
    ]);

    return pageOf(
      rows.map((job) =>
        this.withSystemMatch(
          this.withMatchState(this.withSavedFlag(job)),
          profile,
          dictionary,
        ),
      ),
      total,
      query,
    );
  }
  private async listByMatchScore(
    jobWhere: Prisma.JobWhereInput,
    query: ListJobsQueryDto,
    userId: string,
  ) {
    const where = { userId, job: jobWhere };

    const [rows, total, profile, dictionary] = await Promise.all([
      this.prisma.jobRequirementMatch.findMany({
        where,
        orderBy: [{ percent: 'desc' }, { jobId: 'desc' }],
        ...pageArgs(query),
        select: { job: { select: this.cardSelect(userId) } },
      }),
      this.prisma.jobRequirementMatch.count({ where }),
      this.matchProfileOf(userId),
      this.dictionary.lookup(),
    ]);

    return pageOf(
      rows.map((row) =>
        this.withSystemMatch(
          this.withMatchState(this.withSavedFlag(row.job)),
          profile,
          dictionary,
        ),
      ),
      total,
      query,
    );
  }
  async filters() {
    const [byProvince, byOccupation, bySubOccupation] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['provinceCode'],
        orderBy: { provinceCode: 'asc' },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['occupationCode'],
        orderBy: { occupationCode: 'asc' },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['subOccupationCode'],
        orderBy: { subOccupationCode: 'asc' },
        _count: true,
      }),
    ]);

    const provinceCounts = new Map(
      byProvince.map((row) => [row.provinceCode, row._count]),
    );
    const occupationCounts = new Map(
      byOccupation.map((row) => [row.occupationCode, row._count]),
    );
    const subCounts = new Map(
      bySubOccupation.map((row) => [row.subOccupationCode, row._count]),
    );

    return {
      provinces: PROVINCES.map((province) => ({
        code: province.code,
        name: province.name,
        count: provinceCounts.get(province.code) ?? 0,
      })),
      occupations: OCCUPATIONS.map((occupation) => ({
        code: occupation.code,
        name: occupation.name,
        count: occupationCounts.get(occupation.code) ?? 0,
        subs: (SUB_OCCUPATIONS[occupation.code] ?? []).map((sub) => ({
          code: sub.code,
          name: sub.name,
          count: subCounts.get(sub.code) ?? 0,
        })),
      })),

      remote: {
        code: REMOTE_CODE,
        name: 'Làm việc từ xa',
        count: provinceCounts.get(REMOTE_CODE) ?? 0,
      },
    };
  }

  async get(id: string, userId: string) {
    const [job, skills, dictionary, profileUpdatedAt] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id },
        include: this.relations(userId),
      }),
      this.matchProfileOf(userId),
      this.dictionary.lookup(),
      this.profileUpdatedAt(userId),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${id}`);
    return this.withSystemMatch(
      this.withMatchDetail(this.withSavedFlag(job), profileUpdatedAt),
      skills,
      dictionary,
    );
  }
  async save(userId: string, jobId: string) {
    await this.get(jobId, userId);
    await this.prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
    return { saved: true };
  }
  async unsave(userId: string, jobId: string) {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: false };
  }

  async listSaved(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [saves, total] = await this.prisma.$transaction([
      this.prisma.savedJob.findMany({
        where,
        orderBy: { savedAt: 'desc' },
        ...pageArgs(query),
        include: { job: true },
      }),
      this.prisma.savedJob.count({ where }),
    ]);

    return pageOf(
      saves.map((save) => ({
        ...save.job,
        saved: true,
        savedAt: save.savedAt,
      })),
      total,
      query,
    );
  }
}
