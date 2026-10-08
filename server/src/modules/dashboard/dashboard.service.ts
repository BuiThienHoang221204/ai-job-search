import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { missingFields } from '../profile/utils/completion';
import { jobCardSelect } from '../jobs/job-card.select';
import {
  activityStreak,
  buildSuggestions,
  marketSummary,
  recurringGaps,
  roundedScore,
  todayScore,
  weeklyProgress,
  type SuggestionInput,
} from './dashboard.utils';
import { DAY_MS, daysAgo } from '@/common/duration';
import { OCCUPATIONS, OTHER_CODE } from '../jobs/taxonomy/occupations';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
  ) {}

  private static readonly ELIGIBLE = {
    status: 'DONE',
    NOT: { eligibility: 'FAIL' },
  } as const;

  /** Tin mới trong ngành từ `since`: tổng số, top tỉnh, top nghề; không tính bản sao. */
  private async market(occupationCode: string, since: Date) {
    const where = {
      occupationCode,
      duplicateOfId: null,
      scrapedAt: { gte: since },
    };
    const [total, byProvince, bySub] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.groupBy({ by: ['provinceCode'], where, _count: true }),
      this.prisma.job.groupBy({
        by: ['subOccupationCode'],
        where,
        _count: true,
      }),
    ]);
    return {
      occupationName:
        OCCUPATIONS.find((row) => row.code === occupationCode)?.name ??
        occupationCode,
      total,
      days: 7,
      ...marketSummary(byProvince, bySub, occupationCode),
    };
  }

  /** Hành trình, mục tiêu tuần, chuỗi ngày hoạt động và tin đang dở (đã chấm, chưa có CV, chưa nộp đơn). */
  private async progress(userId: string) {
    const monthAgo = daysAgo(30);
    const notApplied = { none: { userId, status: 'APPLIED' as const } };
    const [cvs, applied, interviews, documents, appliedRows, runs, resume] =
      await Promise.all([
        this.prisma.document.count({ where: { userId, kind: 'CV' } }),
        this.prisma.application.count({ where: { userId, status: 'APPLIED' } }),
        this.prisma.agentRun.count({
          where: { userId, workflow: 'interview' },
        }),
        this.prisma.document.findMany({
          where: { userId, createdAt: { gte: monthAgo } },
          select: { createdAt: true },
        }),
        this.prisma.application.findMany({
          where: { userId, appliedAt: { gte: monthAgo } },
          select: { appliedAt: true },
        }),
        this.prisma.agentRun.findMany({
          where: {
            userId,
            workflow: 'interview',
            createdAt: { gte: monthAgo },
          },
          select: { createdAt: true },
        }),
        this.prisma.jobMatch.findFirst({
          where: {
            userId,
            ...DashboardService.ELIGIBLE,
            job: {
              documents: { none: { userId, kind: 'CV' } },
              applications: notApplied,
            },
          },
          orderBy: { evaluatedAt: { sort: 'desc', nulls: 'last' } },
          select: {
            overallScore: true,
            job: { select: { id: true, title: true, company: true } },
          },
        }),
      ]);

    const activity = {
      documents: documents.map((row) => row.createdAt),
      applied: appliedRows.flatMap((row) => row.appliedAt ?? []),
      interviews: runs.map((row) => row.createdAt),
    };
    const now = new Date();

    return {
      journey: { cvs, applied, interviews },
      weekly: weeklyProgress(activity, now),
      streak: activityStreak(
        [...activity.documents, ...activity.applied, ...activity.interviews],
        now,
      ),
      resume: resume && {
        jobId: resume.job.id,
        title: resume.job.title,
        company: resume.job.company,
        score: resume.overallScore,
      },
    };
  }

  private async requiredSkillsIn(occupationCode: string) {
    const rows = await this.prisma.jobRequirement.findMany({
      where: {
        status: 'DONE',
        job: {
          occupationCode,
          duplicateOfId: null,
          scrapedAt: { gte: daysAgo(30) },
        },
      },
      select: { requiredSkills: true },
      orderBy: { job: { scrapedAt: 'desc' } },
      take: 300,
    });
    return rows.map((row) => row.requiredSkills);
  }

  async overview(userId: string) {
    const since = daysAgo(7);
    const eligible = { userId, ...DashboardService.ELIGIBLE };

    const [
      profile,
      matchCount,
      newThisWeek,
      aggregate,
      pendingMatches,
      recentFive,
      ineligibleCount,
      applications,
      totalScored,
      progress,
    ] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.jobMatch.count({ where: eligible }),
      this.prisma.jobMatch.count({
        where: { ...eligible, createdAt: { gte: since } },
      }),
      this.prisma.jobMatch.aggregate({
        where: eligible,
        _avg: { overallScore: true },
      }),
      this.prisma.jobMatch.findMany({
        where: {
          ...eligible,
          job: { applications: { none: { userId, status: 'APPLIED' } } },
        },
        orderBy: { overallScore: 'desc' },
        take: 4,
        include: { job: { select: jobCardSelect(userId) } },
      }),
      this.prisma.jobMatch.findMany({
        where: eligible,
        orderBy: { evaluatedAt: 'desc' },
        take: 5,
        select: {
          overallScore: true,
          technicalScore: true,
          experienceScore: true,
          behavioralScore: true,
          careerScore: true,
        },
      }),
      this.prisma.jobMatch.count({
        where: { userId, status: 'DONE', eligibility: 'FAIL' },
      }),
      this.applications.countsFor(userId),
      this.prisma.jobMatch.count({ where: { userId, status: 'DONE' } }),
      this.progress(userId),
    ]);

    const best = pendingMatches[0];
    const occupationCode = profile?.occupationCode ?? null;
    const hasOccupation = !!occupationCode && occupationCode !== OTHER_CODE;
    const skillGaps = hasOccupation
      ? recurringGaps(
          await this.requiredSkillsIn(occupationCode),
          [
            ...(profile?.primarySkills ?? []),
            ...(profile?.secondarySkills ?? []),
          ],
          6,
        )
      : [];

    const suggestionInput: SuggestionInput = {
      profileCompletion: profile?.completion ?? 0,
      missingProfileFields: missingFields(profile),
      recurringGaps: skillGaps,
      totalMatches: totalScored,
      topMatch: best
        ? {
            jobId: best.jobId,
            company: best.job.company,
            score: best.overallScore ?? 0,
            daysOld: Math.floor(
              (Date.now() - best.job.scrapedAt.getTime()) / DAY_MS,
            ),
          }
        : null,
      ineligibleCount,
    };

    return {
      profileCompletion: profile?.completion ?? 0,
      occupationCode,
      market: hasOccupation ? await this.market(occupationCode, since) : null,
      matchingJobs: { total: matchCount, newThisWeek },
      averageMatchScore: roundedScore(aggregate._avg.overallScore),
      pendingMatches: pendingMatches.map(
        ({ job: { saves, ...job }, ...match }) => ({
          ...match,
          job: { ...job, saved: saves.length > 0 },
        }),
      ),
      skillGaps,
      totalScored,
      ...progress,
      suggestions: buildSuggestions(suggestionInput),
      applications,
      todayScore: todayScore(recentFive),
    };
  }
}
