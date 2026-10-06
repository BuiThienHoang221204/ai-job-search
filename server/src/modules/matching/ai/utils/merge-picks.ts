import type { SkillMerge } from '../schemas/skill-merge.schema';

export function picksFor(
  decisions: SkillMerge['decisions'],
  asked: readonly number[],
): Map<number, number> | null {
  const picks = new Map<number, number>();
  for (const row of decisions) picks.set(row.term, row.match);
  return asked.every((index) => picks.has(index)) ? picks : null;
}
