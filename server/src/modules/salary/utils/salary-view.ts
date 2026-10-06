import { OCCUPATIONS } from '@/modules/jobs/taxonomy/occupations';
import { EXPERIENCE_LABELS } from '../salary.types';

const OCCUPATION_NAMES = new Map(OCCUPATIONS.map((o) => [o.code, o.name]));

const LABEL_ORDER: readonly string[] = EXPERIENCE_LABELS;

export function occupationName(code: string | null): string | null {
  return code ? (OCCUPATION_NAMES.get(code) ?? null) : null;
}

export function orderBands<T extends { experienceLabel: string }>(
  bands: T[],
): T[] {
  const at = (label: string) => {
    const found = LABEL_ORDER.indexOf(label);
    return found === -1 ? LABEL_ORDER.length : found;
  };
  return [...bands].sort(
    (a, b) => at(a.experienceLabel) - at(b.experienceLabel),
  );
}

type PeerRow = {
  positionSlug: string;
  positionName: string;
  avgMonthly: number | null;
};

export function rankPeers(rows: PeerRow[], currentSlug: string, limit: number) {
  const rankOf = new Map(rows.map((row, at) => [row.positionSlug, at + 1]));
  const currentRank = rankOf.get(currentSlug);

  const shown = rows.slice(0, limit);
  if (currentRank !== undefined && currentRank > limit) {
    shown.push(rows[currentRank - 1]);
  }

  return shown.map((row) => ({
    ...row,
    rank: rankOf.get(row.positionSlug)!,
    isCurrent: row.positionSlug === currentSlug,
  }));
}
