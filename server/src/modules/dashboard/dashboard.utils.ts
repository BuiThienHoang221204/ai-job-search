import { DAY_MS } from '@/common/duration';
import { PROVINCES } from '../jobs/taxonomy/provinces';
import { SUB_OCCUPATIONS } from '../jobs/taxonomy/sub-occupations';
export function normaliseSkill(value: string): string {
  const base = value.toLowerCase().replace(/[\s._-]/g, '');
  return base.length > 4 && base.endsWith('js') ? base.slice(0, -2) : base;
}

export type SkillGap = { skill: string; jobCount: number };

export const roundedScore = (value: number | null | undefined) =>
  value == null ? null : Math.round(value);

export function average(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  return Math.round(
    numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
  );
}

type ScoreRow = {
  overallScore: number | null;
  technicalScore: number | null;
  experienceScore: number | null;
  behavioralScore: number | null;
  careerScore: number | null;
};

export function todayScore(recent: ScoreRow[]) {
  return {
    overall: average(recent.map((match) => match.overallScore)),
    skills: average(recent.map((match) => match.technicalScore)),
    experience: average(recent.map((match) => match.experienceScore)),
    behavioral: average(recent.map((match) => match.behavioralScore)),
    career: average(recent.map((match) => match.careerScore)),
    sampleSize: recent.length,
  };
}

/** Kỹ năng bắt buộc mà hồ sơ chưa có, đếm theo số tin yêu cầu; chỉ giữ kỹ năng có ít nhất 2 tin. */
export function recurringGaps(
  jobSkills: string[][],
  knownSkills: string[],
  limit = 5,
): SkillGap[] {
  const known = new Set(knownSkills.map(normaliseSkill));
  const counts = new Map<string, SkillGap>();

  for (const skills of jobSkills) {
    for (const skill of new Set(skills)) {
      const key = normaliseSkill(skill);
      if (!key || known.has(key)) continue;
      const entry = counts.get(key) ?? { skill, jobCount: 0 };
      entry.jobCount += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
    .filter((gap) => gap.jobCount >= 2)
    .sort((a, b) => b.jobCount - a.jobCount || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}

export type SuggestionType = 'cv' | 'apply' | 'network' | 'skill';

export type Suggestion = {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  href?: string;
};

export type SuggestionInput = {
  profileCompletion: number;
  missingProfileFields: string[];
  recurringGaps: SkillGap[];
  totalMatches: number;
  topMatch: {
    jobId: string;
    company: string;
    score: number;
    daysOld: number;
  } | null;
  ineligibleCount: number;
};

const HOT_MATCH_SCORE = 85;
const HOT_MATCH_MAX_DAYS = 7;

export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (input.profileCompletion < 100 && input.missingProfileFields.length) {
    const missing = input.missingProfileFields.slice(0, 3).join(', ');
    suggestions.push({
      id: 'profile-incomplete',
      type: 'cv',
      title: `Hoàn thiện hồ sơ (${input.profileCompletion}%)`,
      description: `Còn thiếu: ${missing}. Hồ sơ đầy đủ giúp việc chấm điểm phù hợp chính xác hơn đáng kể.`,
      href: '/dashboard/profile',
    });
  }

  const topGap = input.recurringGaps[0];
  if (topGap && topGap.jobCount >= 2) {
    suggestions.push({
      id: `skill-${topGap.skill.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'skill',
      title: `Học ${topGap.skill}`,
      description: `${topGap.jobCount} tin trong ngành yêu cầu kỹ năng này mà hồ sơ chưa có.`,
      href: '/dashboard/upskill',
    });
  }

  if (
    input.topMatch &&
    input.topMatch.score >= HOT_MATCH_SCORE &&
    input.topMatch.daysOld <= HOT_MATCH_MAX_DAYS
  ) {
    suggestions.push({
      id: `apply-${input.topMatch.jobId}`,
      type: 'apply',
      title: `${input.topMatch.company} đang tuyển gấp`,
      description: `Tin mới nhất đạt ${input.topMatch.score}% phù hợp với hồ sơ của bạn — nên ứng tuyển sớm.`,
      href: `/dashboard/jobs/${input.topMatch.jobId}`,
    });
  }

  if (
    input.ineligibleCount >= 2 &&
    input.ineligibleCount * 3 >= input.totalMatches
  ) {
    suggestions.push({
      id: 'ineligible-high',
      type: 'network',
      title: 'Nhiều tin không đủ điều kiện ứng tuyển',
      description: `${input.ineligibleCount}/${input.totalMatches} việc bị loại ở bước xét điều kiện. Cân nhắc điều chỉnh tiêu chí tìm kiếm.`,
      href: '/dashboard/jobs',
    });
  }

  if (!suggestions.length && input.totalMatches === 0) {
    suggestions.push({
      id: 'no-jobs',
      type: 'apply',
      title: 'Bắt đầu bằng một lần quét việc',
      description:
        'Chưa có công việc nào được chấm điểm. Quét tin tuyển dụng để hệ thống bắt đầu đánh giá độ phù hợp.',
      href: '/dashboard/jobs',
    });
  }

  return suggestions.slice(0, 4);
}

export type MarketCount = { code: string; name: string; count: number };

const MARKET_TOP = 5;

function topCounts(
  rows: { code: string | null; count: number }[],
  names: Map<string, string>,
): MarketCount[] {
  const known: MarketCount[] = [];
  for (const row of rows) {
    const name = row.code ? names.get(row.code) : undefined;
    if (row.code && name)
      known.push({ code: row.code, name, count: row.count });
  }
  return known.sort((a, b) => b.count - a.count).slice(0, MARKET_TOP);
}

/** Top tỉnh và top nghề có nhiều tin nhất trong ngành, bỏ tin chưa phân loại, đổi mã thành tên hiển thị. */
export function marketSummary(
  byProvince: { provinceCode: string | null; _count: number }[],
  bySub: { subOccupationCode: string | null; _count: number }[],
  occupationCode: string,
): { provinces: MarketCount[]; subs: MarketCount[] } {
  const provinceNames = new Map(PROVINCES.map((row) => [row.code, row.name]));
  const subNames = new Map(
    (SUB_OCCUPATIONS[occupationCode] ?? []).map((row) => [row.code, row.name]),
  );

  return {
    provinces: topCounts(
      byProvince.map((row) => ({ code: row.provinceCode, count: row._count })),
      provinceNames,
    ),
    subs: topCounts(
      bySub.map((row) => ({ code: row.subOccupationCode, count: row._count })),
      subNames,
    ),
  };
}

export const WEEKLY_GOALS = {
  documents: 2,
  applied: 2,
  interviews: 1,
} as const;

const VN_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
});

const dayKey = (date: Date) => VN_DAY.format(date);

/** Bảy ngày (thứ Hai tới Chủ nhật) của tuần chứa `now`, theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function weekDays(now: Date): string[] {
  const weekday = new Date(`${dayKey(now)}T00:00:00Z`).getUTCDay();
  const monday = now.getTime() - ((weekday + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, index) =>
    dayKey(new Date(monday + index * DAY_MS)),
  );
}

/** Tiến độ ba mục tiêu tuần: số việc mỗi loại rơi vào tuần này so với mục tiêu cố định. */
export function weeklyProgress(
  activity: { documents: Date[]; applied: Date[]; interviews: Date[] },
  now: Date,
) {
  const week = new Set(weekDays(now));
  const count = (dates: Date[]) =>
    dates.filter((date) => week.has(dayKey(date))).length;
  return {
    documents: {
      done: count(activity.documents),
      goal: WEEKLY_GOALS.documents,
    },
    applied: { done: count(activity.applied), goal: WEEKLY_GOALS.applied },
    interviews: {
      done: count(activity.interviews),
      goal: WEEKLY_GOALS.interviews,
    },
  };
}

/** Chuỗi ngày hoạt động liên tiếp tính tới hôm nay (hôm nay chưa làm gì thì tính từ hôm qua), kèm ngày nào trong tuần này có hoạt động. */
export function activityStreak(dates: Date[], now: Date) {
  const active = new Set(dates.map(dayKey));
  let cursor = now.getTime();
  if (!active.has(dayKey(now))) cursor -= DAY_MS;
  let days = 0;
  while (active.has(dayKey(new Date(cursor)))) {
    days += 1;
    cursor -= DAY_MS;
  }
  return { days, week: weekDays(now).map((day) => active.has(day)) };
}
