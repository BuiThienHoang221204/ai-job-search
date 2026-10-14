import { foldTerm } from '@/common/text/vietnamese';
import type {
  RequirementCheck,
  SkillDictionary,
} from '@/modules/matching/rules/types';

const MIN_DEMAND = 2;
const JOBS_PER_GAP = 5;
const NEAR_RATIO = 0.5;

export type GapJob = {
  id: string;
  title: string;
  company: string;
  checks: RequirementCheck[];
};

export type SkillGap = {
  key: string;
  name: string;
  kind: 'REQUIRED' | 'NICE';
  demand: number;
  near: number;
  jobs: { id: string; title: string; company: string }[];
};

type Tally = {
  key: string;
  name: string;
  required: number;
  nice: number;
  near: number;
  demandJobs: GapJob[];
  nearJobs: GapJob[];
};

export const skillKeyOf = (label: string, dictionary: SkillDictionary) =>
  dictionary.get(foldTerm(label)) ?? foldTerm(label);

const isSkillCheck = (check: RequirementCheck) =>
  check.kind === 'SKILL' || check.kind === 'NICE';

function isNear(checks: RequirementCheck[]): boolean {
  const required = checks.filter((check) => check.kind === 'SKILL');
  const met = required.filter((check) => check.met === true).length;
  return required.length > 0 && met / required.length >= NEAR_RATIO;
}

/** Gộp kỹ năng còn thiếu trên các tin, xếp theo số tin yêu cầu; `near` đếm những tin "gần đạt" (đã khớp ≥ một nửa kỹ năng bắt buộc) mà vẫn thiếu kỹ năng đó. */
export function aggregateSkillGaps(
  jobs: GapJob[],
  dictionary: SkillDictionary,
  names: ReadonlyMap<string, string>,
): SkillGap[] {
  const tallies = new Map<string, Tally>();

  for (const job of jobs) {
    const seen = new Set<string>();
    const near = isNear(job.checks);

    for (const check of job.checks) {
      if (!isSkillCheck(check) || check.met !== false) continue;
      const key = skillKeyOf(check.label, dictionary);
      if (seen.has(key)) continue;
      seen.add(key);

      let tally = tallies.get(key);
      if (!tally) {
        tally = {
          key,
          name: names.get(key) ?? check.label,
          required: 0,
          nice: 0,
          near: 0,
          demandJobs: [],
          nearJobs: [],
        };
        tallies.set(key, tally);
      }

      tally.demandJobs.push(job);
      if (check.kind === 'SKILL') tally.required += 1;
      else tally.nice += 1;
      if (near) {
        tally.near += 1;
        tally.nearJobs.push(job);
      }
    }
  }

  const gaps: SkillGap[] = [];
  for (const tally of tallies.values()) {
    const demand = tally.required + tally.nice;
    if (demand < MIN_DEMAND) continue;
    const shown = tally.nearJobs.length ? tally.nearJobs : tally.demandJobs;
    gaps.push({
      key: tally.key,
      name: tally.name,
      kind: tally.required >= tally.nice ? 'REQUIRED' : 'NICE',
      demand,
      near: tally.near,
      jobs: shown
        .slice(0, JOBS_PER_GAP)
        .map(({ id, title, company }) => ({ id, title, company })),
    });
  }

  return gaps.sort(
    (a, b) =>
      b.demand - a.demand || b.near - a.near || a.name.localeCompare(b.name),
  );
}
