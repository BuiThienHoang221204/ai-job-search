import { OCCUPATION_NAMES } from '@/modules/jobs/taxonomy/occupations';
import { EXPERIENCE_LABELS, type ReferenceBand } from '../salary.types';

const LABEL_ORDER: readonly string[] = EXPERIENCE_LABELS;

export function occupationName(code: string | null): string | null {
  return code ? (OCCUPATION_NAMES.get(code) ?? null) : null;
}

function labelRank(label: string): number {
  const found = LABEL_ORDER.indexOf(label);
  return found === -1 ? LABEL_ORDER.length : found;
}

export function orderBands(bands: ReferenceBand[]): ReferenceBand[] {
  return [...bands].sort(
    (a, b) => labelRank(a.experienceLabel) - labelRank(b.experienceLabel),
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
