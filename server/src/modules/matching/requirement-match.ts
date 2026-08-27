import { REMOTE_CODE } from '../jobs/taxonomy/provinces.js';
import { resolveProvince } from '../jobs/taxonomy/resolve.js';
import type { JobRequirements } from './schemas/job-requirements.schema.js';
import { containsTerm, foldTerm } from './skill-term.js';

/** Kỹ năng phụ đáng ít điểm hơn kỹ năng bắt buộc, nhưng không phải không đáng gì. */
const NICE_TO_HAVE_WEIGHT = 0.5;

export type CheckKind = 'SKILL' | 'NICE' | 'YEARS' | 'ELIGIBILITY' | 'LOCATION';

export type RequirementCheck = {
  label: string;
  kind: CheckKind;
  /** `null` khi hồ sơ thiếu dữ liệu để kết luận - không tính vào mẫu số. */
  met: boolean | null;
  note?: string;
  /**
   * Kỹ năng của hồ sơ đã đáp ứng dòng này NHỜ danh bạ từ tương đương, chứ không
   * nhờ trùng chữ. Giao diện phải hiện ra: model gộp sai thì người dùng thấy
   * ngay, thay vì tin một con số không giải thích được.
   */
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
  eligibility: 'PASS' | 'FAIL' | 'UNVERIFIED';
};

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * Chỉ yêu cầu về NĂNG LỰC vào mẫu số. Địa điểm và quốc tịch là điều kiện lọc,
 * để chúng trong mẫu số thì người ở tỉnh khác bị trừ vào tỉ lệ khớp kỹ năng.
 */
const SCORED_KINDS: ReadonlySet<CheckKind> = new Set<CheckKind>([
  'SKILL',
  'NICE',
  'YEARS',
]);

/**
 * Dạng đã bỏ dấu -> mã kỹ năng chuẩn. Cùng mã nghĩa là cùng một kỹ năng, kể cả
 * khi hai chuỗi không chung một ký tự nào (`Y tá` và `Điều dưỡng`).
 */
export type SkillDictionary = ReadonlyMap<string, string>;

/** Kỹ năng của hồ sơ đáp ứng được một yêu cầu, kèm lý do vì sao. */
type SkillHit = { skill: string; viaDictionary: boolean } | null;

/**
 * Khớp hai chiều theo TỪ ("AWS" khớp hồ sơ ghi "AWS Lambda"), rồi mới tra danh
 * bạ. Thứ tự đó là cố ý: so chữ không tốn gì và không bao giờ sai kiểu gộp nghề.
 */
function findSkill(
  profileSkills: string[],
  required: string,
  dictionary?: SkillDictionary,
): SkillHit {
  const literal = profileSkills.find(
    (skill) => containsTerm(skill, required) || containsTerm(required, skill),
  );
  if (literal) return { skill: literal, viaDictionary: false };

  if (!dictionary) return null;
  const wanted = dictionary.get(foldTerm(required));
  if (!wanted) return null;

  const synonym = profileSkills.find(
    (skill) => dictionary.get(foldTerm(skill)) === wanted,
  );
  return synonym ? { skill: synonym, viaDictionary: true } : null;
}

/**
 * Cổng tư cách: FAIL chỉ khi tin ĐÒI một quốc tịch mà hồ sơ khai khác.
 *
 * Hồ sơ chưa khai quốc tịch thì UNVERIFIED, không phải FAIL - đoán sai ở đây
 * loại thẳng ứng viên khỏi một tin họ đủ điều kiện.
 */
function checkEligibility(
  requirements: JobRequirements,
  profile: MatchProfile,
): RequirementMatch['eligibility'] {
  if (!requirements.citizenshipRequired && !requirements.workPermitRequired) {
    return 'PASS';
  }
  if (requirements.citizenshipRequired) {
    if (!profile.citizenship) return 'UNVERIFIED';
    return normalise(profile.citizenship).includes(
      normalise(requirements.citizenshipRequired),
    )
      ? 'PASS'
      : 'FAIL';
  }
  return profile.workPermit ? 'PASS' : 'UNVERIFIED';
}

/** Nơi làm việc có nằm trong tầm với của ứng viên không. */
function checkLocation(
  requirements: JobRequirements,
  profile: MatchProfile,
): boolean | null {
  if (requirements.remotePolicy === 'REMOTE') return true;
  if (!requirements.city || !profile.location) return null;

  const job = resolveProvince(requirements.city);
  if (job === REMOTE_CODE) return true;

  const home = resolveProvince(profile.location);
  if (!job || !home) return null;

  return home === job;
}

/**
 * Đối chiếu hồ sơ với yêu cầu đã rút ra. KHÔNG gọi model.
 *
 * Trả về từng dòng kiểm tra để giao diện liệt kê được đáp ứng gì, thiếu gì -
 * đó là thứ điểm AI không làm được.
 */
export function matchRequirements(
  requirements: JobRequirements,
  profile: MatchProfile,
  dictionary?: SkillDictionary,
): RequirementMatch {
  const checks: RequirementCheck[] = [];

  const skillCheck = (skill: string, kind: 'SKILL' | 'NICE') => {
    const hit = findSkill(profile.skills, skill, dictionary);
    return {
      label: skill,
      kind,
      met: hit !== null,
      via: hit?.viaDictionary ? hit.skill : undefined,
    } satisfies RequirementCheck;
  };

  for (const skill of requirements.requiredSkills) {
    checks.push(skillCheck(skill, 'SKILL'));
  }

  for (const skill of requirements.niceToHaveSkills) {
    checks.push(skillCheck(skill, 'NICE'));
  }

  if (requirements.minYears !== null) {
    checks.push({
      label: `${requirements.minYears} năm kinh nghiệm`,
      kind: 'YEARS',
      met:
        profile.years === null ? null : profile.years >= requirements.minYears,
      note: profile.years === null ? 'Hồ sơ chưa khai số năm' : undefined,
    });
  }

  const eligibility = checkEligibility(requirements, profile);
  if (eligibility !== 'PASS' || requirements.citizenshipRequired) {
    checks.push({
      label: 'Quốc tịch / giấy phép lao động',
      kind: 'ELIGIBILITY',
      met:
        eligibility === 'PASS' ? true : eligibility === 'FAIL' ? false : null,
      note: requirements.eligibilityQuote || undefined,
    });
  }

  const locationPass = checkLocation(requirements, profile);
  if (locationPass !== null) {
    const relocating = !locationPass && profile.willingToRelocate;
    checks.push({
      label: requirements.city
        ? `Địa điểm: ${requirements.city}`
        : 'Làm việc từ xa',
      kind: 'LOCATION',
      met: locationPass || relocating,
      note: relocating
        ? 'Khác tỉnh với hồ sơ, nhưng bạn đã đánh dấu sẵn sàng chuyển chỗ.'
        : undefined,
    });
  }

  const weightOf = (check: RequirementCheck) =>
    check.kind === 'NICE' ? NICE_TO_HAVE_WEIGHT : 1;

  let metWeight = 0;
  let totalWeight = 0;
  let met = 0;
  let total = 0;

  for (const check of checks) {
    if (check.met === null || !SCORED_KINDS.has(check.kind)) continue;
    total += 1;
    totalWeight += weightOf(check);
    if (check.met) {
      met += 1;
      metWeight += weightOf(check);
    }
  }

  const score =
    eligibility === 'FAIL'
      ? 0
      : totalWeight === 0
        ? 0
        : Math.round((metWeight / totalWeight) * 100);

  return { checks, met, total, score, eligibility };
}
