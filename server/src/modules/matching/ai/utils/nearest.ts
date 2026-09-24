/** Sàn để lọc ứng viên trước khi hỏi model (0,72 — đo 17 cặp, cặp cùng nghĩa thấp nhất 0,739); thiếu nó thì `manual testing` gộp với `English`. */
export const MIN_SIMILARITY = 0.72;

/** Trần cách viết của MỘT kỹ năng: nhóm phình to là dấu hiệu gộp dây chuyền (`JavaScript` kéo `TypeScript` kéo `Node.js`). */
export const MAX_ALIASES = 6;

/** Một kỹ năng chuẩn đã nạp sẵn vector, giữ trong bộ nhớ suốt một lượt dựng. */
export type Canonical = {
  id: string;
  name: string;
  /** Cách viết ĐÃ nhập vào mã này. Model phải thấy để không gộp dây chuyền. */
  aliases: string[];
  vector: number[];
};

/** Cosine trên vector đã chuẩn hoá chính là tích vô hướng. */
export function nearest(
  vector: number[],
  canonicals: Canonical[],
  shortlist: number,
): Canonical[] {
  return canonicals
    .map((canonical) => {
      let score = 0;
      for (let i = 0; i < vector.length; i += 1) {
        score += vector[i] * canonical.vector[i];
      }
      return { canonical, score };
    })
    .filter(
      (row) =>
        row.score >= MIN_SIMILARITY &&
        row.canonical.aliases.length < MAX_ALIASES,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, shortlist)
    .map((row) => row.canonical);
}
