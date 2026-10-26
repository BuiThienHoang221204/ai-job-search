import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import {
  profileForJob,
  toMatchProfile,
} from '../matching/ai/utils/requirements';
import { SkillDictionaryService } from '../matching/ai/services/skill-dictionary.service';
import { SalaryService } from '../salary/salary.service';
import { salaryProfileOf } from '../salary/utils/candidate';
import {
  jobCardSelect,
  PUBLIC_JOB_DETAIL_SELECT,
  PUBLIC_JOB_FIELDS,
} from './job-card.select';
import {
  filterTree,
  listOrderFor,
  MATCH_DETAIL_FIELDS,
  MATCH_STATE_FIELDS,
  orderFor,
  whereFrom,
  withMatchDetail,
  withApplication,
  withMatchState,
  withSavedFlag,
  withSystemMatch,
  withoutChecks,
} from './utils/job-view';
import { needsOccupation, profileFit } from './utils/occupation-gate';
import type { JobSort, ListJobsQueryDto, PublicJobsQueryDto } from './job.dto';
import { toPublicJobDetail } from './utils/public-job';
import { repostSignal } from './utils/repost';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SkillDictionaryService,
    private readonly salary: SalaryService,
  ) {}

  /** MỘT lần đọc hồ sơ cho mọi thứ trang việc làm cần: cổng ngành, đối chiếu kỹ năng, bảng lương. */
  private profileOf(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
      select: {
        occupationCode: true,
        subOccupationCodes: true,
        preferredProvinces: true,
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
    applications: { where: { userId }, select: { id: true, status: true } },
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
    let jobWhere = whereFrom(query, userId, fit);
    if (query.followed) {
      const follows = await this.prisma.companyFollow.findMany({
        where: { userId },
        select: { companyKey: true },
      });
      const keys = follows.map((follow) => follow.companyKey);
      jobWhere = { AND: [jobWhere, { companyKey: { in: keys } }] };
    }
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
        withoutChecks(
          withSystemMatch(
            withMatchState(withSavedFlag(job)),
            profile,
            dictionary,
          ),
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
    sort: JobSort,
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
  async publicList(query: PublicJobsQueryDto) {
    const where = whereFrom(query, null);
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: orderFor('newest'),
        ...pageArgs(query),
        select: PUBLIC_JOB_FIELDS,
      }),
      this.prisma.job.count({ where }),
    ]);
    return pageOf(rows, total, query);
  }

  async publicGet(id: string) {
    const [job, dictionary] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id },
        select: PUBLIC_JOB_DETAIL_SELECT,
      }),
      this.dictionary.lookup(),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${id}`);
    return toPublicJobDetail(job, dictionary);
  }

  async filters() {
    const [byProvince, byOccupation, bySubOccupation] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['provinceCode'],
        where: { duplicateOfId: null },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['occupationCode'],
        where: { duplicateOfId: null },
        _count: true,
      }),
      this.prisma.job.groupBy({
        by: ['subOccupationCode'],
        where: { duplicateOfId: null },
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
      withMatchDetail(
        withApplication(withSavedFlag(job)),
        profileMeta?.updatedAt ?? null,
      ),
      skills,
      dictionary,
    );

    const [salaryGuide, reposts] = await Promise.all([
      this.salary.guideForJob(
        job,
        job.requirements?.status === 'DONE' ? job.requirements : null,
        skills && profileMeta
          ? salaryProfileOf({
              sameOccupationYears: profileForJob(skills, job.occupationCode)
                .years,
              totalYears: skills.years,
              profileOccupation: profileMeta.occupationCode,
              jobOccupation: job.occupationCode,
              currentSalary: profileMeta.currentSalary,
              expectedSalary: profileMeta.expectedSalary,
            })
          : null,
      ),
      this.repostsOf(job.dedupeKey),
    ]);

    return {
      ...scored,
      salaryGuide,
      reposts,
      profileLocation: profileMeta?.location ?? null,
    };
  }

  private async repostsOf(dedupeKey: string | null) {
    if (!dedupeKey) return null;
    const postings = await this.prisma.job.findMany({
      where: { dedupeKey, duplicateOfId: null },
      select: { postedAt: true, scrapedAt: true },
    });
    return repostSignal(
      postings.map((posting) => posting.postedAt ?? posting.scrapedAt),
    );
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
}
