import { jobTitleOf } from '../../profile/headline.js';

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

/**
 * Cắt về giới hạn `query` của `searchPlanSchema` (2..60 ký tự).
 *
 * Dùng chung `jobTitleOf` với bộ phân loại ngành, để một headline luôn cho ra
 * cùng một chức danh dù đang đi tìm tin hay đang xếp hồ sơ vào cụm.
 */
function normaliseQuery(raw: string): string | null {
  const text = jobTitleOf(raw).slice(0, 60).trim();
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

/** Một NGÀNH có người dùng, kèm từ khoá đại diện cho ngành đó. */
export type ProfileCluster = {
  occupationCode: string;
  /** Chức danh phổ biến nhất trong cụm, đã làm sạch. */
  query: string;
  /** Số hồ sơ thuộc cụm. Dùng để ưu tiên khi phải cắt bớt. */
  size: number;
};

/** Đúng những trường của hồ sơ mà việc gom cụm cần tới. */
export type ClusterProfile = {
  headline: string | null;
  primarySkills: string[];
  occupationCode: string | null;
};

/** Đếm tần suất, bỏ chuỗi rỗng. */
function tally(values: Array<string | null | undefined>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Mục xuất hiện nhiều nhất; hoà thì lấy theo thứ tự bảng chữ cái cho tất định. */
function mostCommon(counts: Map<string, number>): string | null {
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'),
  );
  return ranked[0]?.[0] ?? null;
}

/**
 * Gom hồ sơ thành cụm THEO NGÀNH, mỗi cụm một từ khoá đại diện.
 *
 * Bản trước sinh một từ khoá cho mỗi HỒ SƠ, nên số từ khoá tăng thẳng theo số
 * người dùng và trần truy vấn cắt mất những người xếp sau bảng chữ cái. Gom
 * theo ngành thì số từ khoá bị chặn bởi danh mục ngành (19 mục) và đứng yên dù
 * có 10 hay 10.000 người dùng.
 *
 * Hồ sơ chưa suy được ngành bị bỏ qua: chúng cũng không có chức danh nào dùng
 * làm từ khoá được.
 */
export function clusterProfiles(profiles: ClusterProfile[]): ProfileCluster[] {
  const groups = new Map<string, ClusterProfile[]>();

  for (const profile of profiles) {
    if (!profile.occupationCode) continue;
    const group = groups.get(profile.occupationCode) ?? [];
    group.push(profile);
    groups.set(profile.occupationCode, group);
  }

  const clusters: ProfileCluster[] = [];

  for (const [occupationCode, group] of groups) {
    // Chức danh trước, kỹ năng chỉ là đường lùi: chức danh là thứ nhà tuyển
    // dụng dùng để đặt tên tin, còn kỹ năng chính của một kế toán là "Excel".
    const term =
      mostCommon(tally(group.map((profile) => profile.headline))) ??
      mostCommon(
        tally(group.flatMap((profile) => profile.primarySkills.slice(0, 4))),
      );

    const query = term ? normaliseQuery(term) : null;
    if (!query) continue;

    clusters.push({ occupationCode, query, size: group.length });
  }

  return clusters.sort(
    (a, b) =>
      b.size - a.size || a.occupationCode.localeCompare(b.occupationCode),
  );
}

/** Đổi cụm thành truy vấn quét. Địa điểm để trống - lượt quét hệ thống không lọc tỉnh. */
export function clusterQuery(cluster: ProfileCluster): PlannedQuery {
  return {
    query: cluster.query,
    location: '',
    rationale: `${cluster.size} hồ sơ ngành ${cluster.occupationCode}.`,
  };
}
