/** Chuẩn hóa tên công nghệ để so khớp giữa hồ sơ và tag của tin tuyển dụng. */
export function normaliseSkill(value: string): string {
  const base = value.toLowerCase().replace(/[\s._-]/g, '');
  return base.length > 4 && base.endsWith('js') ? base.slice(0, -2) : base;
}

export type SkillGap = { skill: string; jobCount: number };

/** Đếm từ khóa xuất hiện trong các tin đã chấm điểm mà hồ sơ KHÔNG có. */
export function recurringGaps(
  scored: Array<{ job: { tags: string[] } }>,
  knownSkills: string[],
  limit = 5,
): SkillGap[] {
  const known = new Set(knownSkills.map(normaliseSkill));
  const counts = new Map<string, SkillGap>();

  for (const { job } of scored) {
    for (const tag of new Set(job.tags)) {
      const key = normaliseSkill(tag);
      if (!key || known.has(key)) continue;
      const entry = counts.get(key) ?? { skill: tag, jobCount: 0 };
      entry.jobCount += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.jobCount - a.jobCount || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}
