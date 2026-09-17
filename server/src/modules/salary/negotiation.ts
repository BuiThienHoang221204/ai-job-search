import type {
  ReferenceBand,
  ReferencePosition,
  ResolvedPosition,
  SalaryBasis,
} from './job-position.js';

export const EXPERIENCE_LABELS = [
  'Dưới 1 năm',
  '1–3 năm',
  '3–5 năm',
  'Trên 5 năm',
] as const;

export type ExperienceLabel = (typeof EXPERIENCE_LABELS)[number];

export type Seniority =
  'INTERN' | 'FRESHER' | 'JUNIOR' | 'MIDDLE' | 'SENIOR' | 'LEAD' | 'UNKNOWN';

const SENIORITY_YEARS: Record<Seniority, number | null> = {
  INTERN: 0,
  FRESHER: 0,
  JUNIOR: 1,
  MIDDLE: 3,
  SENIOR: 5,
  LEAD: 5,
  UNKNOWN: null,
};

const NEUTRAL_FIT = 50;
const STRONG_FIT = 75;
const WEAK_FIT = 40;
const MIN_RAISE_OVER_CURRENT = 1.1;
const ROUNDING = 500_000;
const SPREAD_WITHOUT_BAND = 0.25;
const STRETCH_FOR_FIT = 0.15;

export interface NegotiationInput {
  resolved: ResolvedPosition;
  candidateYears: number | null;
  minYears: number | null;
  seniority: Seniority;
  fitScore: number | null;
  postedMin?: number | null;
  postedMax?: number | null;
  currentSalary?: number | null;
  expectedSalary?: number | null;
}

export interface NegotiationRange {
  floor: number;
  target: number;
  ceiling: number;
  currency: string;
  basis: SalaryBasis;
  label: string;
  positionCount: number;
  experienceLabel: ExperienceLabel | null;
  experienceSource: ExperienceSource | null;
  candidateYears: number | null;
  requiredYears: number | null;
  experienceGap: boolean;
  anchoredOnCurrentSalary: boolean;
  cappedByPosting: boolean;
  expectedSalary: number | null;
  expectedAboveCeiling: boolean;
  expectedBelowFloor: boolean;
}

export type ExperienceSource = 'PROFILE' | 'POSTING';

export function labelForYears(years: number | null): ExperienceLabel | null {
  if (years === null) return null;
  if (years < 1) return 'Dưới 1 năm';
  if (years < 3) return '1–3 năm';
  if (years < 5) return '3–5 năm';
  return 'Trên 5 năm';
}

export function requiredYearsOf(
  minYears: number | null,
  seniority: Seniority,
): number | null {
  return minYears ?? SENIORITY_YEARS[seniority];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function pickNumbers<T>(rows: T[], read: (row: T) => number | null): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const value = read(row);
    if (value !== null && value > 0) values.push(value);
  }
  return values;
}

function bandsAt(
  positions: ReferencePosition[],
  label: ExperienceLabel | null,
): ReferenceBand[] {
  if (!label) return [];
  const bands: ReferenceBand[] = [];
  for (const position of positions) {
    const band = position.bands.find((row) => row.experienceLabel === label);
    if (band) bands.push(band);
  }
  return bands;
}

function roundToStep(value: number): number {
  return Math.max(ROUNDING, Math.round(value / ROUNDING) * ROUNDING);
}

function clamp(value: number, min: number | null, max: number | null): number {
  let result = value;
  if (min !== null) result = Math.max(result, min);
  if (max !== null) result = Math.min(result, max);
  return result;
}

export function negotiationRange(
  input: NegotiationInput,
): NegotiationRange | null {
  const { positions, basis, label } = input.resolved;
  if (positions.length === 0) return null;

  const requiredYears = requiredYearsOf(input.minYears, input.seniority);
  const candidateLabel = labelForYears(input.candidateYears);
  const requiredLabel = labelForYears(requiredYears);

  const experienceLabel = candidateLabel ?? requiredLabel;
  const experienceSource: ExperienceSource | null = candidateLabel
    ? 'PROFILE'
    : requiredLabel
      ? 'POSTING'
      : null;
  const experienceGap =
    candidateLabel !== null &&
    requiredLabel !== null &&
    EXPERIENCE_LABELS.indexOf(requiredLabel) >
      EXPERIENCE_LABELS.indexOf(candidateLabel);

  const bands = bandsAt(positions, experienceLabel);

  const bandLow = median(pickNumbers(bands, (band) => band.minAmount));
  const bandMid = median(pickNumbers(bands, (band) => band.avgAmount));
  const bandHigh = median(pickNumbers(bands, (band) => band.maxAmount));

  const positionLow = median(
    pickNumbers(positions, (position) => position.rangeMin),
  );
  const positionMid = median(
    pickNumbers(positions, (position) => position.avgMonthly),
  );
  const positionHigh = median(
    pickNumbers(positions, (position) => position.rangeMax),
  );

  const mid = bandMid ?? positionMid;
  if (mid === null) return null;

  const hasBand = bandMid !== null;
  const low = hasBand
    ? (bandLow ?? mid)
    : clamp(mid * (1 - SPREAD_WITHOUT_BAND), positionLow, positionHigh);
  const high = hasBand
    ? (bandHigh ?? mid)
    : clamp(mid * (1 + SPREAD_WITHOUT_BAND), positionLow, positionHigh);

  const fit = input.fitScore ?? NEUTRAL_FIT;
  const lean = (fit - NEUTRAL_FIT) / NEUTRAL_FIT;
  const rawTarget =
    lean >= 0 ? mid + (high - mid) * lean : mid + (mid - low) * lean;

  let floor = low;
  let ceiling = high;

  if (fit >= STRONG_FIT) {
    const stretched = high * (1 + STRETCH_FOR_FIT);
    ceiling =
      positionHigh === null
        ? stretched
        : Math.min(stretched, Math.max(positionHigh, high));
  }
  if (fit <= WEAK_FIT) {
    const stretched = low * (1 - STRETCH_FOR_FIT);
    floor =
      positionLow === null
        ? stretched
        : Math.max(stretched, Math.min(positionLow, low));
  }

  let anchoredOnCurrentSalary = false;
  const current = input.currentSalary ?? null;
  if (current !== null && current > 0) {
    const raised = current * MIN_RAISE_OVER_CURRENT;
    if (raised > floor) {
      floor = raised;
      anchoredOnCurrentSalary = true;
    }
    if (floor > ceiling) ceiling = floor;
  }

  let cappedByPosting = false;
  const postedMax = input.postedMax ?? null;
  if (postedMax !== null && postedMax > 0 && postedMax < ceiling) {
    ceiling = postedMax;
    cappedByPosting = true;
  }
  const postedMin = input.postedMin ?? null;
  if (postedMin !== null && postedMin > 0 && postedMin > floor) {
    floor = Math.min(postedMin, ceiling);
  }

  if (floor > ceiling) floor = ceiling;

  const target = Math.min(Math.max(rawTarget, floor), ceiling);
  const expected = input.expectedSalary ?? null;

  const roundedFloor = roundToStep(floor);
  const roundedCeiling = roundToStep(ceiling);

  return {
    floor: roundedFloor,
    target: Math.min(
      Math.max(roundToStep(target), roundedFloor),
      roundedCeiling,
    ),
    ceiling: roundedCeiling,
    currency: positions[0].currency,
    basis,
    label,
    positionCount: positions.length,
    experienceLabel,
    experienceSource,
    candidateYears: input.candidateYears,
    requiredYears,
    experienceGap,
    anchoredOnCurrentSalary,
    cappedByPosting,
    expectedSalary: expected,
    expectedAboveCeiling: expected !== null && expected > roundedCeiling,
    expectedBelowFloor: expected !== null && expected < roundedFloor,
  };
}
