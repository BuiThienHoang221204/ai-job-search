import type {
  FitVerdict,
  JobRequirement,
  MatchStatus,
  Prisma,
} from '@/generated/prisma/client';
import { countTerms, normalizeText } from '@/common/text/vietnamese';
import { isStaleMatch } from '@/modules/matching/rules/staleness';
import { toRequirements } from '@/modules/matching/ai/utils/requirements';
import { matchRequirements } from '@/modules/matching/rules/requirement-match';
import type {
  MatchProfile,
  SkillDictionary,
} from '@/modules/matching/rules/types';
import {
  nearbyOccupations,
  OCCUPATIONS,
  OTHER_CODE,
  otherSubCodeOf,
  parentOfOtherSubCode,
} from '../taxonomy/occupations';
import { SUB_OCCUPATIONS } from '../taxonomy/sub-occupations';
import { PROVINCES, REMOTE_CODE } from '../taxonomy/provinces';
import type { JobSort, ListJobsQueryDto } from '../job.dto';
import { daysAgo } from '@/common/duration';

export const MATCH_STATE_FIELDS = {
  status: true,
  overallScore: true,
  verdict: true,
} satisfies Prisma.JobMatchSelect;

export const MATCH_DETAIL_FIELDS = {
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

export function withSavedFlag<T extends { saves: unknown[] }>(job: T) {
  const { saves, ...rest } = job;
  return { ...rest, saved: saves.length > 0 };
}

export function withMatchState<
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

export function withMatchDetail<
  T extends { matches: { evaluatedAt: Date | null }[] },
>(job: T, profileUpdatedAt: Date | null) {
  const { matches, ...rest } = job;
  const match = matches[0];
  if (!match) return { ...rest, match: null };

  return {
    ...rest,
    match: {
      ...match,
      stale: isStaleMatch(match.evaluatedAt, profileUpdatedAt),
    },
  };
}

/** Chưa rút được yêu cầu thì rơi về đếm từ khoá, kèm `kind` để giao diện không hiện như điểm thật. */
export function withSystemMatch<
  T extends {
    title: string;
    tags: string[];
    requirements: JobRequirement | null;
  },
>(job: T, profile: MatchProfile | null, dictionary: SkillDictionary) {
  const { requirements, ...rest } = job;

  if (!profile) return { ...rest, systemMatch: null };

  if (requirements?.status === 'DONE') {
    const result = matchRequirements(
      toRequirements(requirements),
      profile,
      dictionary,
    );
    return {
      ...rest,
      systemMatch: {
        kind: 'REQUIREMENTS' as const,
        met: result.met,
        total: result.total,
        skillMet: result.skillMet,
        skillTotal: result.skillTotal,
        score: result.score,
        eligibility: result.eligibility,
        checks: result.checks,
      },
    };
  }

  const keywordHits = countTerms(
    `${job.title} ${job.tags.join(' ')}`,
    profile.skills,
  );
  return {
    ...rest,
    systemMatch: {
      kind: 'KEYWORDS' as const,
      met: keywordHits,
      total: profile.skills.length,
      skillMet: keywordHits,
      skillTotal: profile.skills.length,
      score: 0,
      eligibility: 'UNVERIFIED' as const,
      checks: [],
    },
  };
}

export function occupationGate(
  query: ListJobsQueryDto,
  profileOccupation: string | null,
): Prisma.JobWhereInput | null {
  if (!query.scored) return null;
  if (!profileOccupation || profileOccupation === OTHER_CODE) return null;

  return {
    OR: [
      { occupationCode: { in: nearbyOccupations(profileOccupation) } },
      { occupationCode: null },
    ],
  };
}

function occupationFacetWhere(
  query: ListJobsQueryDto,
): Prisma.JobWhereInput | null {
  const groups = query.occupation ?? [];
  const rawSubs = query.subOccupation ?? [];
  if (!groups.length && !rawSubs.length) return null;

  const subs: string[] = [];
  const otherOfParents: string[] = [];
  for (const code of rawSubs) {
    const parent = parentOfOtherSubCode(code);
    if (parent) otherOfParents.push(parent);
    else subs.push(code);
  }

  const clauses: Prisma.JobWhereInput[] = [];
  if (groups.length) clauses.push({ occupationCode: { in: groups } });
  if (subs.length) clauses.push({ subOccupationCode: { in: subs } });
  for (const parent of otherOfParents) {
    clauses.push({ occupationCode: parent, subOccupationCode: null });
  }

  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

export function whereFrom(
  query: ListJobsQueryDto,
  userId: string,
  minPercent: number,
  profileOccupation: string | null = null,
): Prisma.JobWhereInput {
  const needle = query.q ? normalizeText(query.q) : '';
  const since = query.postedWithin ? daysAgo(query.postedWithin) : null;
  const gate = occupationGate(query, profileOccupation);
  const facet = occupationFacetWhere(query);
  const and = [gate, facet].filter(
    (clause): clause is Prisma.JobWhereInput => clause !== null,
  );

  return {
    duplicateOfId: null,
    ...(and.length ? { AND: and } : {}),
    ...(needle ? { searchText: { contains: needle } } : {}),
    ...(query.province?.length ? { provinceCode: { in: query.province } } : {}),
    ...(query.workMode?.length ? { workMode: { in: query.workMode } } : {}),
    ...(query.salaryMin ? { salaryMax: { gte: query.salaryMin } } : {}),
    ...(since ? { postedAt: { gte: since } } : {}),
    ...(query.scored
      ? { skillMatches: { some: { userId, percent: { gte: minPercent } } } }
      : {}),
    ...(query.saved ? { saves: { some: { userId } } } : {}),
    ...(query.applied ? { applications: { some: { userId } } } : {}),
  };
}

export type ListOrder = JobSort | 'posted';

export const listOrderFor = (query: ListJobsQueryDto): ListOrder =>
  query.scored ? 'posted' : (query.sort ?? 'newest');

export function orderFor(
  sort: ListOrder,
): Prisma.JobOrderByWithRelationInput[] {
  if (sort === 'posted') {
    return [
      { postedAt: { sort: 'desc', nulls: 'last' } },
      { scrapedAt: 'desc' },
      { id: 'desc' },
    ];
  }
  if (sort === 'salary') {
    return [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
  }
  return [{ scrapedAt: 'desc' }, { id: 'desc' }];
}

type CountRow = { _count: number };

export function filterTree(
  byProvince: (CountRow & { provinceCode: string | null })[],
  byOccupation: (CountRow & { occupationCode: string | null })[],
  bySubOccupation: (CountRow & { subOccupationCode: string | null })[],
) {
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
    occupations: OCCUPATIONS.map((occupation) => {
      const total = occupationCounts.get(occupation.code) ?? 0;
      const subs = (SUB_OCCUPATIONS[occupation.code] ?? []).map((sub) => ({
        code: sub.code,
        name: sub.name,
        count: subCounts.get(sub.code) ?? 0,
      }));
      const unclassified =
        total - subs.reduce((sum, sub) => sum + sub.count, 0);

      return {
        code: occupation.code,
        name: occupation.name,
        count: total,
        subs:
          subs.length && unclassified > 0
            ? [
                ...subs,
                {
                  code: otherSubCodeOf(occupation.code),
                  name: 'Khác',
                  count: unclassified,
                },
              ]
            : subs,
      };
    }),
    remote: {
      code: REMOTE_CODE,
      name: 'Làm việc từ xa',
      count: provinceCounts.get(REMOTE_CODE) ?? 0,
    },
  };
}
