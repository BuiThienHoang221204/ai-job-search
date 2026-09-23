export type CheckKind = 'SKILL' | 'NICE' | 'YEARS' | 'ELIGIBILITY' | 'LOCATION';

export type RequirementCheck = {
  label: string;
  kind: CheckKind;
  /** `null` khi hồ sơ thiếu dữ liệu để kết luận - không tính vào mẫu số. */
  met: boolean | null;
  note?: string;
  /** Đáp ứng NHỜ danh bạ từ tương đương chứ không nhờ trùng chữ — giao diện phải hiện để model gộp sai thì thấy ngay. */
  via?: string;
};

export type MatchProfile = {
  skills: string[];
  citizenship: string | null;
  workPermit: string | null;
  location: string | null;
  willingToRelocate: boolean;
  /** Số năm kinh nghiệm. `null` khi hồ sơ chưa có dữ liệu có kiểu. */
  years: number | null;
};

export type RequirementMatch = {
  checks: RequirementCheck[];
  met: number;
  total: number;
  /** 0-100. Bằng 0 khi eligibility FAIL, giống đường chấm bằng AI. */
  score: number;
  rank: number;
  eligibility: 'PASS' | 'FAIL' | 'UNVERIFIED';
};

/** Dạng bỏ dấu → mã chuẩn. Cùng mã là cùng kỹ năng kể cả khi không chung ký tự nào (`Y tá` / `Điều dưỡng`). */
export type SkillDictionary = ReadonlyMap<string, string>;

/** Một hồ sơ đã rút gọn về đúng thứ phép đối chiếu cần, kèm dấu thời gian để tính vân tay. */
export type Candidate = {
  userId: string;
  profile: MatchProfile;
  stamp: string;
};

export type ShortlistRow = {
  userId: string;
  jobId: string;
  rank: number;
};

export type ShortlistCandidate = {
  userId: string;
  lastFanOutAt: Date | null;
  jobIds: string[];
};

export type ShortlistInput = {
  rows: ShortlistRow[];
  lastFanOutAt: Map<string, Date | null>;
  topN?: number;
  maxPerRun?: number;
};

export type ShortlistTarget = { userId: string; jobId: string };

export type ShortlistPlan = {
  targets: ShortlistTarget[];
  served: string[];
  deferred: number;
};

export type ShortlistResult = {
  queued: number;
  served: number;
  deferred: number;
};
