import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { missingFields } from '../profile/utils/completion';
import { jobCardSelect } from '../jobs/job-card.select';
import {
  buildSuggestions,
  recurringGaps,
  roundedScore,
  todayScore,
  type SuggestionInput,
} from './dashboard.utils';
import { DAY_MS, daysAgo } from '@/common/duration';

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

  async overview(userId: string) {
    const since = daysAgo(7);
    const eligible = { userId, ...DashboardService.ELIGIBLE };

    const [
      profile,
      matchCount,
      newThisWeek,
      aggregate,
      topMatches,
      best,
      recentFive,
      ineligibleCount,
      scoredJobs,
      applications,
      totalScored,
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
        where: eligible,
        orderBy: [
          { evaluatedAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        take: 4,
        include: { job: { select: jobCardSelect(userId) } },
      }),
      this.prisma.jobMatch.findFirst({
        where: eligible,
        orderBy: { overallScore: 'desc' },
        select: {
          jobId: true,
          overallScore: true,
          job: { select: { company: true, scrapedAt: true } },
        },
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
      this.prisma.jobMatch.findMany({
        where: { userId, status: 'DONE' },
        select: { job: { select: { tags: true } } },
        take: 100,
      }),
      this.applications.countsFor(userId),
      this.prisma.jobMatch.count({ where: { userId, status: 'DONE' } }),
    ]);

    const suggestionInput: SuggestionInput = {
      profileCompletion: profile?.completion ?? 0,
      missingProfileFields: missingFields(profile),
      recurringGaps: recurringGaps(scoredJobs, [
        ...(profile?.primarySkills ?? []),
        ...(profile?.secondarySkills ?? []),
      ]),
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
      occupationCode: profile?.occupationCode ?? null,
      matchingJobs: { total: matchCount, newThisWeek },
      averageMatchScore: roundedScore(aggregate._avg.overallScore),
      topMatches: topMatches.map(({ job: { saves, ...job }, ...match }) => ({
        ...match,
        job: { ...job, saved: saves.length > 0 },
      })),
      suggestions: buildSuggestions(suggestionInput),
      applications,
      todayScore: todayScore(recentFive),
    };
  }
}
