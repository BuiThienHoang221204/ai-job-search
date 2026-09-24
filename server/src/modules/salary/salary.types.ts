/** Mảng và type đi liền nhau — `ExperienceLabel` suy ra từ chính mảng này, tách ra là phải import giá trị vào file type. */
export const EXPERIENCE_LABELS = [
  'Dưới 1 năm',
  '1–3 năm',
  '3–5 năm',
  'Trên 5 năm',
] as const;

export type ExperienceLabel = (typeof EXPERIENCE_LABELS)[number];

/** Nguồn suy ra mốc kinh nghiệm: hồ sơ ứng viên, hay yêu cầu của tin. */
export type ExperienceSource = 'PROFILE' | 'POSTING';

export type Seniority =
  'INTERN' | 'FRESHER' | 'JUNIOR' | 'MIDDLE' | 'SENIOR' | 'LEAD' | 'UNKNOWN';

/** Khớp ĐÚNG một vị trí, hay phải gộp cả nhóm nghề. */
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

export interface IndexedPosition {
  position: ReferencePosition;
  tokens: string[];
}

/** Hai chiều tra: theo ngành để dò tên, theo slug để lấy thẳng. Dựng một lần rồi cache. */
export interface PositionIndex {
  byOccupation: Map<string, IndexedPosition[]>;
  bySlug: Map<string, ReferencePosition>;
}

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

/** Đúng những trường của tin mà việc tra lương cần — không nhận cả bản ghi `Job`. */
export interface SalaryGuideJob {
  title: string;
  occupationCode: string | null;
  subOccupationCode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

export interface SalaryGuideRequirements {
  minYears: number | null;
  seniority: Seniority;
}

export interface SalaryGuideProfile {
  candidateYears: number | null;
  currentSalary: number | null;
  expectedSalary: number | null;
}

/** `positionSlug` chỉ có khi khớp ĐÚNG một vị trí — nhóm theo nghề thì không có trang chi tiết nào để dẫn tới. */
export type SalaryGuide = NegotiationRange & {
  positionSlug: string | null;
};
