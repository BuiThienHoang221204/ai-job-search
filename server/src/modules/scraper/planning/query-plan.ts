import { resolveSubOccupation } from '../../jobs/taxonomy/resolve.js';
import { jobTitleOf } from '../../profile/headline.js';

export const MAX_QUERIES = 5;

export type PlannedQuery = {
  query: string;
  location: string;
  rationale: string;
};

export type QueryProfile = {
  headline: string | null;
  location: string | null;
  primarySkills: string[];
  targetSectors: string[];
};

function normaliseQuery(raw: string): string | null {
  const text = jobTitleOf(raw).slice(0, 60).trim();
  return text.length >= 2 ? text : null;
}

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

export type ProfileCluster = {
  clusterCode: string;
  query: string;
  size: number;
};

export type ClusterProfile = {
  headline: string | null;
  primarySkills: string[];
  occupationCode: string | null;
};

function tally(values: Array<string | null | undefined>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function mostCommon(counts: Map<string, number>): string | null {
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'),
  );
  return ranked[0]?.[0] ?? null;
}

export function clusterCodeOf(profile: ClusterProfile): string | null {
  const occupationCode = profile.occupationCode;
  if (!occupationCode) return null;

  return (
    resolveSubOccupation(
      occupationCode,
      profile.headline ?? '',
      profile.primarySkills,
    ) ?? occupationCode
  );
}

export function clusterProfiles(profiles: ClusterProfile[]): ProfileCluster[] {
  const groups = new Map<string, ClusterProfile[]>();

  for (const profile of profiles) {
    const clusterCode = clusterCodeOf(profile);
    if (!clusterCode) continue;

    const group = groups.get(clusterCode) ?? [];
    group.push(profile);
    groups.set(clusterCode, group);
  }

  const clusters: ProfileCluster[] = [];

  for (const [clusterCode, group] of groups) {
    const term =
      mostCommon(tally(group.map((profile) => profile.headline))) ??
      mostCommon(
        tally(group.flatMap((profile) => profile.primarySkills.slice(0, 4))),
      );

    const query = term ? normaliseQuery(term) : null;
    if (!query) continue;

    clusters.push({ clusterCode, query, size: group.length });
  }

  return clusters.sort(
    (a, b) => b.size - a.size || a.clusterCode.localeCompare(b.clusterCode),
  );
}

export function clusterQuery(cluster: ProfileCluster): PlannedQuery {
  return {
    query: cluster.query,
    location: '',
    rationale: `${cluster.size} hồ sơ nghề ${cluster.clusterCode}.`,
  };
}
