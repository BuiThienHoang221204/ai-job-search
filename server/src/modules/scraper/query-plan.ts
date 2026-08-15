/** Sinh từ khoá tìm việc từ hồ sơ, không gọi AI. */

/** Trần số truy vấn cho một lần quét. Mỗi truy vấn là một request tới portal. */
export const MAX_QUERIES = 5;

export type PlannedQuery = {
  query: string;
  location: string;
  rationale: string;
};

/** Đúng những trường của `Profile` mà việc sinh truy vấn cần tới. */
export type QueryProfile = {
  headline: string | null;
  location: string | null;
  primarySkills: string[];
  targetSectors: string[];
};

/** Cắt về giới hạn `query` của `searchPlanSchema` (2..60 ký tự). */
function normaliseQuery(raw: string): string | null {
  const text = raw
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return text.length >= 2 ? text : null;
}

/** Truy vấn tất định sinh từ hồ sơ một người dùng. */
export function planFromProfile(profile: QueryProfile | null): PlannedQuery[] {
  const city = profile?.location?.trim() ?? '';
  const headline = profile?.headline ? normaliseQuery(profile.headline) : null;
  const sectors = (profile?.targetSectors ?? [])
    .map((sector) => sector.trim())
    .filter(Boolean);
  const skills = (profile?.primarySkills ?? [])
    .map((skill) => skill.trim())
    .filter(Boolean);

  const queries: PlannedQuery[] = [];
  const seen = new Set<string>();

  const push = (raw: string, rationale: string): void => {
    const query = normaliseQuery(raw);
    if (!query) return;
    const key = query.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ query, location: city, rationale });
  };

  if (headline) {
    push(headline, 'Chức danh hiện tại trong hồ sơ.');

    for (const sector of sectors) {
      push(
        `${headline} ${sector}`,
        `Chức danh trong lĩnh vực mục tiêu: ${sector}.`,
      );
    }
  }

  for (const skill of skills.slice(0, 4)) {
    push(skill, `Kỹ năng chính: ${skill}.`);
  }

  return queries.slice(0, MAX_QUERIES);
}

/** Từ khoá cho lần quét của HỆ THỐNG: gộp chức danh và kỹ năng của mọi hồ sơ. */
export function planForSystem(
  profiles: Array<Pick<QueryProfile, 'headline' | 'primarySkills'>>,
  limit: number,
): PlannedQuery[] {
  const tally = (values: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = value.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  const rank = (counts: Map<string, number>): Array<[string, number]> =>
    [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'),
    );

  const headlines = rank(
    tally(profiles.map((profile) => profile.headline ?? '')),
  );
  const skills = rank(
    tally(profiles.flatMap((profile) => profile.primarySkills.slice(0, 4))),
  );

  const queries: PlannedQuery[] = [];
  const seen = new Set<string>();

  for (const [term, count] of [...headlines, ...skills]) {
    if (queries.length >= limit) break;
    const query = normaliseQuery(term);
    if (!query) continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({
      query,
      location: '',
      rationale: `${count} hồ sơ khai mục này.`,
    });
  }

  return queries;
}
