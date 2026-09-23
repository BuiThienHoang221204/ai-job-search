/** Hàm thuần của màn Tổng quan: đếm khoảng trống kỹ năng, rồi dựng thẻ gợi ý. */

/** Chuẩn hóa tên công nghệ để so khớp giữa hồ sơ và tag của tin tuyển dụng. */
export function normaliseSkill(value: string): string {
  const base = value.toLowerCase().replace(/[\s._-]/g, '');
  return base.length > 4 && base.endsWith('js') ? base.slice(0, -2) : base;
}

export type SkillGap = { skill: string; jobCount: number };

/** Đếm từ khóa xuất hiện trong các tin đã chấm điểm mà hồ sơ KHÔNG có. */
export function recurringGaps(
  scored: Array<{ job: { tags: string[] } }>,
  knownSkills: string[],
  limit = 5,
): SkillGap[] {
  const known = new Set(knownSkills.map(normaliseSkill));
  const counts = new Map<string, SkillGap>();

  for (const { job } of scored) {
    for (const tag of new Set(job.tags)) {
      const key = normaliseSkill(tag);
      if (!key || known.has(key)) continue;
      const entry = counts.get(key) ?? { skill: tag, jobCount: 0 };
      entry.jobCount += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
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

/** Ngưỡng trên nó mới coi là "rất phù hợp, nên nộp sớm". */
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
      description:
        input.totalMatches > 0
          ? `${topGap.jobCount}/${input.totalMatches} việc đã chấm yêu cầu kỹ năng này mà hồ sơ chưa có.`
          : `${topGap.jobCount} việc yêu cầu kỹ năng này mà hồ sơ chưa có.`,
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
