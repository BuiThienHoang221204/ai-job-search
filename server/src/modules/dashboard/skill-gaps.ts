/// Chuẩn hóa tên công nghệ để so khớp giữa hồ sơ và tag của tin tuyển dụng.
///
/// Bỏ dấu cách và dấu phân cách là chưa đủ. Hồ sơ ghi "ReactJS" còn tin ghi
/// "React" - nếu chỉ hạ chữ thường rồi so bằng nhau, hệ thống sẽ khuyên một
/// lập trình viên React đi học React. Đã gặp đúng lỗi này khi chạy thử.
///
/// Cắt đuôi "js" xử lý được phần lớn trường hợp trong hệ sinh thái JavaScript
/// (ReactJS/React, NodeJS/Node, Next.js/Next, VueJS/Vue) mà không dính vào
/// "JavaScript" - chuỗi đó không kết thúc bằng "js".
///
/// KHÔNG dùng so khớp chuỗi con: "JavaScript".includes("Java") là đúng, và
/// khi đó hệ thống sẽ im lặng về việc ứng viên thiếu Java.
export function normaliseSkill(value: string): string {
  const base = value.toLowerCase().replace(/[\s._-]/g, '');
  return base.length > 4 && base.endsWith('js') ? base.slice(0, -2) : base;
}

export type SkillGap = { skill: string; jobCount: number };

/// Đếm từ khóa xuất hiện trong các tin đã chấm điểm mà hồ sơ KHÔNG có.
///
/// Đếm theo TIN chứ không theo lần xuất hiện: một tag lặp lại trong cùng một
/// tin không biến nó thành nhu cầu của thị trường.
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
