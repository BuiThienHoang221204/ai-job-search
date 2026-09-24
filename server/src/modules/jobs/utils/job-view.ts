import type {
  FitVerdict,
  JobRequirement,
  MatchStatus,
  Prisma,
} from '../../../generated/prisma/client.js';
import { countTerms } from '../../../common/text/vietnamese.js';
import { isStaleMatch } from '../../matching/rules/staleness.js';
import { toRequirements } from '../../matching/ai/utils/requirements.js';
import { matchRequirements } from '../../matching/rules/requirement-match.js';
import type {
  MatchProfile,
  SkillDictionary,
} from '../../matching/rules/types.js';
import { normalizeText } from '../taxonomy/resolve.js';
import { OCCUPATIONS } from '../taxonomy/occupations.js';
import { SUB_OCCUPATIONS } from '../taxonomy/sub-occupations.js';
import { PROVINCES, REMOTE_CODE } from '../taxonomy/provinces.js';
import type { JobSort, ListJobsQueryDto } from '../job.dto.js';

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

/** Luật `stale` dùng CHUNG với `matching`, đừng chép lại: hai bên lệch nhau thì trang chi tiết và danh sách nói khác nhau. */
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

/** Chưa rút được yêu cầu thì rơi về đếm từ khoá, và nói rõ `kind` để giao diện đừng hiện như điểm thật. */
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
      met: countTerms(`${job.title} ${job.tags.join(' ')}`, profile.skills),
      total: profile.skills.length,
      score: 0,
      eligibility: 'UNVERIFIED' as const,
      checks: [],
    },
  };
}

/** `duplicateOfId: null` là bộ lọc CỐ ĐỊNH: bản sao giữa các portal được lưu nhưng không được hiện. */
export function whereFrom(
  query: ListJobsQueryDto,
  userId: string,
  minPercent: number,
): Prisma.JobWhereInput {
  const needle = query.q ? normalizeText(query.q) : '';
  const since = query.postedWithin
    ? new Date(Date.now() - query.postedWithin * 24 * 60 * 60 * 1000)
    : null;

  return {
    duplicateOfId: null,
    ...(needle ? { searchText: { contains: needle } } : {}),
    ...(query.province?.length ? { provinceCode: { in: query.province } } : {}),
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
      ? { skillMatches: { some: { userId, percent: { gte: minPercent } } } }
      : {}),
    ...(query.saved ? { saves: { some: { userId } } } : {}),
    ...(query.applied ? { applications: { some: { userId } } } : {}),
  };
}

export function orderFor(sort: JobSort): Prisma.JobOrderByWithRelationInput[] {
  if (sort === 'salary') {
    return [{ salaryMax: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
  }
  return [{ scrapedAt: 'desc' }, { id: 'desc' }];
}

type CountRow = { _count: number };

/** Cây bộ lọc: mọi mã trong taxonomy đều hiện, kể cả mã đang có 0 tin. */
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
