import type {
  ClusterProfile,
  PlannedQuery,
  ProfileCluster,
  QueryProfile,
} from '../types';
import { resolveSubOccupation } from '@/modules/jobs/taxonomy/resolve';
import {
  SUB_OCCUPATIONS,
  SUB_OCCUPATION_PARENT,
  type SubOccupation,
} from '@/modules/jobs/taxonomy/sub-occupations';
import { jobTitleOf } from '@/modules/profile/utils/occupation';

export const MAX_QUERIES = 5;

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

  if (!queries.length && profile?.subOccupationCode) {
    const fallback = subOccupationQuery(profile.subOccupationCode);
    if (fallback) {
      push(
        fallback,
        `Nghề đã chọn lúc "Chọn nhanh": ${profile.subOccupationCode}.`,
      );
    }
  }

  return queries.slice(0, MAX_QUERIES);
}

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

const ENGLISH_QUERY_GROUPS = new Set(['IT', 'DATA_AI']);

const HAS_VIETNAMESE_DIACRITICS = /[^ -~]/;

function pickNamePart(name: string): string {
  const parts = name
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return name.trim();

  const accented = parts.filter((part) => HAS_VIETNAMESE_DIACRITICS.test(part));
  if (accented.length === 1) return accented[0];

  return parts.reduce((longest, part) =>
    part.length > longest.length ? part : longest,
  );
}

function queryForSub(groupCode: string, sub: SubOccupation): string {
  return ENGLISH_QUERY_GROUPS.has(groupCode)
    ? sub.keywords[0]
    : pickNamePart(sub.name);
}

export function taxonomyBaseline(): ProfileCluster[] {
  return Object.entries(SUB_OCCUPATIONS).flatMap(([groupCode, subs]) =>
    subs.map((sub) => ({
      clusterCode: sub.code,
      query: queryForSub(groupCode, sub),
      size: 0,
    })),
  );
}

function subOccupationQuery(code: string): string | null {
  const groupCode = SUB_OCCUPATION_PARENT[code];
  if (!groupCode) return null;
  const sub = SUB_OCCUPATIONS[groupCode]?.find((entry) => entry.code === code);
  return sub ? queryForSub(groupCode, sub) : null;
}

export function occupationGroupOf(clusterCode: string): string {
  return SUB_OCCUPATION_PARENT[clusterCode] ?? clusterCode;
}

export function clusterQuery(cluster: ProfileCluster): PlannedQuery {
  return {
    query: cluster.query,
    location: '',
    rationale: `${cluster.size} hồ sơ nghề ${cluster.clusterCode}.`,
  };
}
