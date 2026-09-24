import type { SkillMerge } from '../schemas/skill-merge.schema.js';

/** Gom lựa chọn của model; TRẢ NULL nếu lô thiếu dòng, vì schema cho phép mảng rỗng nên bỏ sót không tự lộ ra. */
export function picksFor(
  decisions: SkillMerge['decisions'],
  asked: readonly number[],
): Map<number, number> | null {
  const picks = new Map<number, number>();
  for (const row of decisions) picks.set(row.term, row.match);
  return asked.every((index) => picks.has(index)) ? picks : null;
}
