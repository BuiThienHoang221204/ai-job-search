import { stripNoise } from '../jobs/taxonomy/dedupe.js';
import { normalizeText } from '../jobs/taxonomy/resolve.js';
import { SUB_OCCUPATION_POSITIONS } from './sub-occupation-map.js';

export type SalaryBasis = 'POSITION' | 'SUB_OCCUPATION';

export interface ReferenceBand {
  experienceLabel: string;
  minAmount: number | null;
  avgAmount: number | null;
  maxAmount: number | null;
}

export interface ReferencePosition {
  positionSlug: string;
  positionName: string;
  occupationCode: string | null;
  avgMonthly: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  currency: string;
  bands: ReferenceBand[];
}

export interface ResolvedPosition {
  basis: SalaryBasis;
  label: string;
  positions: ReferencePosition[];
}

interface IndexedPosition {
  position: ReferencePosition;
  tokens: string[];
}

export interface PositionIndex {
  byOccupation: Map<string, IndexedPosition[]>;
  bySlug: Map<string, ReferencePosition>;
}

export const TITLE_MATCH_THRESHOLD = 0.8;
export const MIN_MATCHED_TOKENS = 2;

const ROLE_NOISE = [
  'kinh nghiem',
  'tot nghiep',
  'di lam',
  'thu nhap',
  'luong cung',
  'khong yeu cau',
  'yeu cau',
  'uu tien',
  'so luong',
  'phuc loi',
  'senior',
  'junior',
  'middle',
  'fresher',
  'intern',
  'all level',
];

const HEAD_SEPARATORS = /[-–—([|/,]/;
const MIN_HEAD_LENGTH = 3;

function roleHead(title: string): string {
  const head = title.split(HEAD_SEPARATORS)[0];
  return head.trim().length >= MIN_HEAD_LENGTH ? head : title;
}

function dropPhrases(normalized: string, phrases: string[]): string {
  let text = ` ${normalized} `;
  for (const phrase of phrases) text = text.split(` ${phrase} `).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

export function roleTokens(value: string): string[] {
  return dropPhrases(stripNoise(normalizeText(value)), ROLE_NOISE)
    .split(' ')
    .filter((token) => token.length > 1);
}

export function buildPositionIndex(rows: ReferencePosition[]): PositionIndex {
  const byOccupation = new Map<string, IndexedPosition[]>();
  const bySlug = new Map<string, ReferencePosition>();

  for (const position of rows) {
    bySlug.set(position.positionSlug, position);
    if (!position.occupationCode) continue;

    const entry = { position, tokens: roleTokens(position.positionName) };
    const bucket = byOccupation.get(position.occupationCode);
    if (bucket) bucket.push(entry);
    else byOccupation.set(position.occupationCode, [entry]);
  }

  return { byOccupation, bySlug };
}

function matchByTitle(
  title: string,
  occupationCode: string,
  index: PositionIndex,
): ReferencePosition | null {
  const candidates = index.byOccupation.get(occupationCode);
  if (!candidates?.length) return null;

  const titleTokens = new Set(roleTokens(roleHead(title)));
  let best: IndexedPosition | null = null;
  let bestScore = 0;
  let bestOverlap = 0;

  for (const candidate of candidates) {
    if (candidate.tokens.length === 0) continue;

    const overlap = candidate.tokens.filter((token) =>
      titleTokens.has(token),
    ).length;
    const score = overlap / candidate.tokens.length;

    const moreSpecific =
      score === bestScore &&
      score > 0 &&
      best !== null &&
      candidate.tokens.length > best.tokens.length;

    if (score > bestScore || moreSpecific) {
      best = candidate;
      bestScore = score;
      bestOverlap = overlap;
    }
  }

  if (
    !best ||
    bestScore < TITLE_MATCH_THRESHOLD ||
    bestOverlap < MIN_MATCHED_TOKENS
  ) {
    return null;
  }
  return best.position;
}

function matchBySubOccupation(
  subOccupationCode: string,
  index: PositionIndex,
): ReferencePosition[] {
  const slugs = SUB_OCCUPATION_POSITIONS[subOccupationCode];
  if (!slugs?.length) return [];

  const positions: ReferencePosition[] = [];
  for (const slug of slugs) {
    const position = index.bySlug.get(slug);
    if (position) positions.push(position);
  }
  return positions;
}

export function resolveJobPosition(
  job: {
    title: string;
    occupationCode: string | null;
    subOccupationCode: string | null;
  },
  index: PositionIndex,
): ResolvedPosition | null {
  if (job.occupationCode) {
    const exact = matchByTitle(job.title, job.occupationCode, index);
    if (exact) {
      return {
        basis: 'POSITION',
        label: exact.positionName,
        positions: [exact],
      };
    }
  }

  if (job.subOccupationCode) {
    const group = matchBySubOccupation(job.subOccupationCode, index);
    if (group.length > 0) {
      return {
        basis: 'SUB_OCCUPATION',
        label: group.map((position) => position.positionName).join(', '),
        positions: group,
      };
    }
  }

  return null;
}
