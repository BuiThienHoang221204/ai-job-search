import { REMOTE_CODE } from '../../jobs/taxonomy/provinces.js';
import { resolveProvince } from '../../jobs/taxonomy/resolve.js';
import { containsTerm, foldTerm } from '../../../common/text/vietnamese.js';
import type { JobRequirements } from '../ai/schemas/job-requirements.schema.js';
import type {
  CheckKind,
  MatchProfile,
  RequirementCheck,
  RequirementMatch,
  SkillDictionary,
} from './types.js';

/** Kỹ năng phụ đáng ít điểm hơn kỹ năng bắt buộc, nhưng không phải không đáng gì. */
const NICE_TO_HAVE_WEIGHT = 0.5;

const UNMET_PRIOR_WEIGHT = 2;

const normalise = (value: string) => value.trim().toLowerCase();

/** Chỉ NĂNG LỰC vào mẫu số: địa điểm và quốc tịch là điều kiện lọc, để vào mẫu số thì người tỉnh khác bị trừ điểm kỹ năng. */
const SCORED_KINDS: ReadonlySet<CheckKind> = new Set<CheckKind>([
  'SKILL',
  'NICE',
  'YEARS',
]);

/** Kỹ năng của hồ sơ đáp ứng được một yêu cầu, kèm lý do vì sao. */
type SkillHit = { skill: string; viaDictionary: boolean } | null;

/** So chữ TRƯỚC rồi mới tra danh bạ — thứ tự cố ý: so chữ không tốn gì và không bao giờ sai kiểu gộp nghề. */
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

/** FAIL chỉ khi tin ĐÒI quốc tịch mà hồ sơ khai khác; chưa khai thì UNVERIFIED — đoán sai là loại thẳng ứng viên đủ điều kiện. */
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

/** Đối chiếu hồ sơ với yêu cầu đã rút, KHÔNG gọi model. Trả từng dòng kiểm tra — thứ điểm AI không làm được. */
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

  const rank =
    eligibility === 'FAIL' || totalWeight === 0
      ? 0
      : Math.round((metWeight / (totalWeight + UNMET_PRIOR_WEIGHT)) * 10_000) /
        10_000;

  return { checks, met, total, score, rank, eligibility };
}
