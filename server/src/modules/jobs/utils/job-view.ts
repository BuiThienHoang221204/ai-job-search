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
import {
  nearbyOccupations,
  OCCUPATIONS,
  OTHER_CODE,
} from '../taxonomy/occupations.js';
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

/** Cổng ngành của "Việc làm phù hợp" KHÔNG có lối thoát: bộ lọc ngành của người dùng giao với nó; muốn xem ngành khác thì sang "Tất cả việc làm". */
export function occupationGate(
  query: ListJobsQueryDto,
  profileOccupation: string | null,
): Prisma.JobWhereInput | null {
  if (!query.scored) return null;
  // Hồ sơ chưa rõ ngành thì không có căn cứ nào để biết "ngành của họ".
  if (!profileOccupation || profileOccupation === OTHER_CODE) return null;

  return {
    OR: [
      { occupationCode: { in: nearbyOccupations(profileOccupation) } },
      { occupationCode: null },
    ],
  };
}

/** `duplicateOfId: null` là bộ lọc CỐ ĐỊNH: bản sao giữa các portal được lưu nhưng không được hiện. */
export function whereFrom(
  query: ListJobsQueryDto,
  userId: string,
  minPercent: number,
  profileOccupation: string | null = null,
): Prisma.JobWhereInput {
  const needle = query.q ? normalizeText(query.q) : '';
  const since = query.postedWithin
    ? new Date(Date.now() - query.postedWithin * 24 * 60 * 60 * 1000)
    : null;
  const gate = occupationGate(query, profileOccupation);

  return {
    duplicateOfId: null,
    ...(gate ? { AND: [gate] } : {}),
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

/** Thứ tự nội bộ, KHÔNG mở qua HTTP: `posted` chỉ dành cho "Việc làm phù hợp". */
export type ListOrder = JobSort | 'posted';

/** "Việc làm phù hợp" LUÔN xếp theo ngày đăng mới nhất; `sort` người dùng gửi lên bị bỏ qua để link cũ vẫn mở được. */
export const listOrderFor = (query: ListJobsQueryDto): ListOrder =>
  query.scored ? 'posted' : (query.sort ?? 'newest');

export function orderFor(
  sort: ListOrder,
): Prisma.JobOrderByWithRelationInput[] {
  // Không index được (postedAt nullable, cần NULLS LAST), nhưng danh sách "phù hợp" chỉ vài trăm tin mỗi người.
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
