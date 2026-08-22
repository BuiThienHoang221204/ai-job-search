import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { missingFields } from '../profile/completion.js';
import { jobCardSelect } from '../jobs/job-card.select.js';
import { buildSuggestions, type SuggestionInput } from './suggestions.js';
import { recurringGaps } from './skill-gaps.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Đường ĐỌC của màn hình Tổng quan. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
  ) {}

  /** Tin bị cổng điều kiện loại KHÔNG được tính vào các con số phù hợp. */
  private static readonly ELIGIBLE = {
    status: 'DONE',
    NOT: { eligibility: 'FAIL' },
  } as const;

  async overview(userId: string) {
    const since = new Date(Date.now() - SEVEN_DAYS_MS);
    const eligible = { userId, ...DashboardService.ELIGIBLE };

    const [
      profile,
      matchCount,
      newThisWeek,
      aggregate,
      topMatches,
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
        orderBy: { overallScore: 'desc' },
        take: 3,
        // Thẻ công việc, không phải cả tin: `include` kéo về cả `description`.
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
      this.prisma.jobMatch.findMany({
        where: { userId, status: 'DONE' },
        select: { job: { select: { tags: true } } },
        take: 100,
      }),
      this.applications.countsFor(userId),
      this.prisma.jobMatch.count({ where: { userId, status: 'DONE' } }),
    ]);

    const average = (values: Array<number | null>): number | null => {
      const numbers = values.filter((value): value is number => value !== null);
      if (!numbers.length) return null;
      return Math.round(
        numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
      );
    };

    const best = topMatches[0];
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
              (Date.now() - best.job.scrapedAt.getTime()) / ONE_DAY_MS,
            ),
          }
        : null,
      ineligibleCount,
    };

    return {
      profileCompletion: profile?.completion ?? 0,
      matchingJobs: { total: matchCount, newThisWeek },
      averageMatchScore: aggregate._avg.overallScore
        ? Math.round(aggregate._avg.overallScore)
        : null,
      topMatches: topMatches.map(({ job: { saves, ...job }, ...match }) => ({
        ...match,
        job: { ...job, saved: saves.length > 0 },
      })),
      suggestions: buildSuggestions(suggestionInput),
      applications,
      /** "Điểm phù hợp hôm nay" trên giao diện: trung bình 5 lần chấm gần nhất. */
      todayScore: {
        overall: average(recentFive.map((match) => match.overallScore)),
        skills: average(recentFive.map((match) => match.technicalScore)),
        experience: average(recentFive.map((match) => match.experienceScore)),
        behavioral: average(recentFive.map((match) => match.behavioralScore)),
        career: average(recentFive.map((match) => match.careerScore)),
        sampleSize: recentFive.length,
      },
    };
  }
}
