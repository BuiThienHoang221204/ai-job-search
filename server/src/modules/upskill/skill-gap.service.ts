import { Injectable } from '@nestjs/common';
import { daysAgo } from '@/common/duration';
import { PrismaService } from '@/prisma/prisma.service';
import {
  needsOccupation,
  profileFit,
} from '@/modules/jobs/utils/occupation-gate';
import { OCCUPATIONS } from '@/modules/jobs/taxonomy/occupations';
import { resolveSubOccupation } from '@/modules/jobs/taxonomy/resolve';
import { nearbySeniorities } from '@/modules/jobs/taxonomy/seniority';
import {
  SUB_OCCUPATIONS,
  nearbySubOccupations,
} from '@/modules/jobs/taxonomy/sub-occupations';
import { SkillDictionaryService } from '@/modules/matching/ai/services/skill-dictionary.service';
import {
  toMatchProfile,
  toRequirements,
} from '@/modules/matching/ai/utils/requirements';
import { matchRequirements } from '@/modules/matching/rules/requirement-match';
import { profileSelect } from '@/modules/matching/rules/match-write';
import {
  aggregateSkillGaps,
  skillKeyOf,
  type GapJob,
  type SkillGap,
} from './utils/skill-gaps';

const RECENT_DAYS = 30;
const MAX_JOBS = 400;

export type SkillGapReport = {
  needsOccupation: boolean;
  occupationCode: string | null;
  occupationName: string | null;
  subOccupationNames: string[];
  experienceLevel: string | null;
  jobsAnalysed: number;
  profileUpdatedAt: Date | null;
  gaps: SkillGap[];
};

@Injectable()
export class SkillGapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SkillDictionaryService,
  ) {}

  /** Kỹ năng còn thiếu so với tin đúng ngành, cấp bậc ±1, 30 ngày gần nhất — đối chiếu bằng đúng luật của "Khớp x/y", không gọi model. */
  async forUser(userId: string): Promise<SkillGapReport> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        ...profileSelect,
        occupationCode: true,
        subOccupationCodes: true,
        preferredProvinces: true,
        experienceLevel: true,
      },
    });
    const fit = profileFit(profile);
    const empty: SkillGapReport = {
      needsOccupation: true,
      occupationCode: fit?.occupationCode ?? null,
      occupationName:
        OCCUPATIONS.find((item) => item.code === fit?.occupationCode)?.name ??
        null,
      subOccupationNames: [],
      experienceLevel: fit?.experienceLevel ?? null,
      jobsAnalysed: 0,
      profileUpdatedAt: profile?.updatedAt ?? null,
      gaps: [],
    };
    if (!profile || !fit?.occupationCode || needsOccupation(fit)) return empty;

    const levels = nearbySeniorities(fit.experienceLevel);
    let subs: string[] | null = null;
    if (fit.subOccupationCodes.length) {
      subs = Array.from(
        new Set(fit.subOccupationCodes.flatMap(nearbySubOccupations)),
      );
    } else {
      const inferred = resolveSubOccupation(
        fit.occupationCode,
        profile.headline ?? '',
        profile.primarySkills,
      );
      if (inferred) subs = nearbySubOccupations(inferred);
    }
    const [requirements, dictionary] = await Promise.all([
      this.prisma.jobRequirement.findMany({
        where: {
          status: 'DONE',
          ...(levels ? { seniority: { in: [...levels, 'UNKNOWN'] } } : {}),
          job: {
            occupationCode: fit.occupationCode,
            ...(subs ? { subOccupationCode: { in: subs } } : {}),
            duplicateOfId: null,
            scrapedAt: { gte: daysAgo(RECENT_DAYS) },
          },
        },
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: { job: { scrapedAt: 'desc' } },
        take: MAX_JOBS,
      }),
      this.dictionary.lookup(),
    ]);

    const matchProfile = toMatchProfile(profile);
    const jobs: GapJob[] = requirements.map((requirement) => ({
      ...requirement.job,
      checks: matchRequirements(
        toRequirements(requirement),
        matchProfile,
        dictionary,
      ).checks,
    }));

    const keys = new Set(
      jobs.flatMap((job) =>
        job.checks.map((check) => skillKeyOf(check.label, dictionary)),
      ),
    );
    const canonicals = await this.prisma.canonicalSkill.findMany({
      where: { id: { in: [...keys] } },
      select: { id: true, name: true },
    });
    const names = new Map(canonicals.map((skill) => [skill.id, skill.name]));

    return {
      ...empty,
      needsOccupation: false,
      subOccupationNames: (SUB_OCCUPATIONS[fit.occupationCode] ?? [])
        .filter((item) => subs?.includes(item.code))
        .map((item) => item.name),
      jobsAnalysed: jobs.length,
      gaps: aggregateSkillGaps(jobs, dictionary, names),
    };
  }
}
