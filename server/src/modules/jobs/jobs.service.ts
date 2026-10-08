import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';
import type { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { toMatchProfile } from '../matching/ai/utils/requirements';
import { SkillDictionaryService } from '../matching/ai/services/skill-dictionary.service';
import { SalaryService } from '../salary/salary.service';
import { yearsOfExperience } from '../profile/utils/experience-years';
import { derivedFields } from './taxonomy/resolve';
import { jobCardSelect } from './job-card.select';
import {
  filterTree,
  listOrderFor,
  type ListOrder,
  MATCH_DETAIL_FIELDS,
  MATCH_STATE_FIELDS,
  orderFor,
  whereFrom,
  withMatchDetail,
  withMatchState,
  withSavedFlag,
  withSystemMatch,
} from './utils/job-view';
import { needsOccupation, profileFit } from './utils/occupation-gate';
import type { CreateJobDto, ListJobsQueryDto } from './job.dto';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SkillDictionaryService,
    private readonly salary: SalaryService,
  ) {}
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
  /** MỘT lần đọc hồ sơ cho mọi thứ trang việc làm cần: cổng ngành, đối chiếu kỹ năng, bảng lương. */
  private profileOf(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
      select: {
        occupationCode: true,
        experienceLevel: true,
        updatedAt: true,
        currentSalary: true,
        expectedSalary: true,
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
  }
  private readonly relations = (userId: string) => ({
    saves: { where: { userId }, select: { id: true } },
    matches: { where: { userId }, select: MATCH_DETAIL_FIELDS },
    requirements: true,
  });
  private readonly cardSelect = (userId: string) =>
    ({
      ...jobCardSelect(userId),
      matches: { where: { userId }, select: MATCH_STATE_FIELDS },
      requirements: true,
    }) satisfies Prisma.JobSelect;

  async list(query: ListJobsQueryDto, userId: string) {
    const stored = await this.profileOf(userId);
    const fit = profileFit(stored);
    if (query.scored && needsOccupation(fit)) {
      return { ...pageOf([], 0, query), needsOccupation: true };
    }
    const jobWhere = whereFrom(query, userId, fit);
    const sort = listOrderFor(query);
    const profile = stored ? toMatchProfile(stored) : null;

    const [rows, total, dictionary] = await Promise.all([
      ...(sort === 'match'
        ? this.byMatchScore(jobWhere, query, userId)
        : this.byJobColumn(jobWhere, query, userId, sort)),
      this.dictionary.lookup(),
    ]);

    return pageOf(
      rows.map((job) =>
        withSystemMatch(
          withMatchState(withSavedFlag(job)),
          profile,
          dictionary,
        ),
      ),
      total,
      query,
    );
  }

  private byJobColumn(
    where: Prisma.JobWhereInput,
    query: ListJobsQueryDto,
    userId: string,
    sort: ListOrder,
  ) {
    return [
      this.prisma.job.findMany({
        where,
        orderBy: orderFor(sort),
        ...pageArgs(query),
        select: this.cardSelect(userId),
      }),
      this.prisma.job.count({ where }),
    ] as const;
  }

  private byMatchScore(
    jobWhere: Prisma.JobWhereInput,
    query: ListJobsQueryDto,
    userId: string,
  ) {
    const where = { userId, job: jobWhere };

    return [
      this.prisma.jobRequirementMatch
        .findMany({
          where,
          orderBy: [
            { rank: 'desc' },
            { met: 'desc' },
            { job: { scrapedAt: 'desc' } },
            { jobId: 'desc' },
          ],
          ...pageArgs(query),
          select: { job: { select: this.cardSelect(userId) } },
        })
        .then((rows) => rows.map((row) => row.job)),
      this.prisma.jobRequirementMatch.count({ where }),
    ] as const;
  }
  async filters() {
    const [byProvince, byOccupation, bySubOccupation] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['provinceCode'],
        where: { duplicateOfId: null },
        orderBy: { provinceCode: 'asc' },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['occupationCode'],
        where: { duplicateOfId: null },
        orderBy: { occupationCode: 'asc' },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['subOccupationCode'],
        where: { duplicateOfId: null },
        orderBy: { subOccupationCode: 'asc' },
        _count: true,
      }),
    ]);

    return filterTree(byProvince, byOccupation, bySubOccupation);
  }

  async get(id: string, userId: string) {
    const [job, dictionary, profileMeta] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id },
        include: this.relations(userId),
      }),
      this.dictionary.lookup(),
      this.profileOf(userId),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${id}`);
    const skills = profileMeta ? toMatchProfile(profileMeta) : null;

    const scored = withSystemMatch(
      withMatchDetail(withSavedFlag(job), profileMeta?.updatedAt ?? null),
      skills,
      dictionary,
    );

    const salaryGuide = await this.salary.guideForJob(
      job,
      job.requirements?.status === 'DONE' ? job.requirements : null,
      scored.systemMatch?.kind === 'REQUIREMENTS'
        ? scored.systemMatch.score
        : null,
      profileMeta
        ? {
            candidateYears: yearsOfExperience(profileMeta.experiences),
            currentSalary: profileMeta.currentSalary,
            expectedSalary: profileMeta.expectedSalary,
          }
        : null,
    );

    return { ...scored, salaryGuide };
  }

  async save(userId: string, jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

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
