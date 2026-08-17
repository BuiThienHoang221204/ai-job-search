import type { JobRequirements } from './job-requirements.schema.js';

/** Kỹ năng phụ đáng ít điểm hơn kỹ năng bắt buộc, nhưng không phải không đáng gì. */
const NICE_TO_HAVE_WEIGHT = 0.5;

export type CheckKind = 'SKILL' | 'NICE' | 'YEARS' | 'ELIGIBILITY' | 'LOCATION';

export type RequirementCheck = {
  label: string;
  kind: CheckKind;
  /** `null` khi hồ sơ thiếu dữ liệu để kết luận - không tính vào mẫu số. */
  met: boolean | null;
  note?: string;
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

/** Khớp hai chiều: "AWS" khớp hồ sơ ghi "AWS Lambda", và ngược lại. */
function hasSkill(profileSkills: string[], required: string): boolean {
  const needle = normalise(required);
  if (needle.length < 2) return false;
  return profileSkills.some((skill) => {
    const own = normalise(skill);
    if (own.length < 2) return false;
    return own.includes(needle) || needle.includes(own);
  });
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
  if (profile.willingToRelocate) return true;
  return normalise(profile.location) === normalise(requirements.city);
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
): RequirementMatch {
  const checks: RequirementCheck[] = [];

  for (const skill of requirements.requiredSkills) {
    checks.push({
      label: skill,
      kind: 'SKILL',
      met: hasSkill(profile.skills, skill),
    });
  }

  for (const skill of requirements.niceToHaveSkills) {
    checks.push({
      label: skill,
      kind: 'NICE',
      met: hasSkill(profile.skills, skill),
    });
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
    checks.push({
      label: requirements.city
        ? `Địa điểm: ${requirements.city}`
        : 'Làm việc từ xa',
      kind: 'LOCATION',
      met: locationPass,
    });
  }

  const weightOf = (check: RequirementCheck) =>
    check.kind === 'NICE' ? NICE_TO_HAVE_WEIGHT : 1;

  let metWeight = 0;
  let totalWeight = 0;
  let met = 0;
  let total = 0;

  for (const check of checks) {
    if (check.met === null) continue;
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
