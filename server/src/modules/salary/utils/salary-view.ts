import { OCCUPATIONS } from '../../jobs/taxonomy/occupations.js';
import { EXPERIENCE_LABELS } from '../salary.types.js';

const OCCUPATION_NAMES = new Map(OCCUPATIONS.map((o) => [o.code, o.name]));

const LABEL_ORDER: readonly string[] = EXPERIENCE_LABELS;

/** Tên ngành để hiển thị. Mã lạ trả `null` chứ không trả chính mã — chuỗi `IT_DEVOPS` trên màn hình là rác, không phải dữ liệu. */
export function occupationName(code: string | null): string | null {
  return code ? (OCCUPATION_NAMES.get(code) ?? null) : null;
}

/** Nhãn giữ nguyên chữ của nguồn nên không sắp theo bảng chữ cái được: "1–3 năm" phải đứng sau "Dưới 1 năm". */
export function orderBands<T extends { experienceLabel: string }>(
  bands: T[],
): T[] {
  // Nhãn lạ xuống CUỐI. `indexOf` trả -1 nên bản cũ đẩy nó lên đầu bảng, im lặng.
  const at = (label: string) => {
    const found = LABEL_ORDER.indexOf(label);
    return found === -1 ? LABEL_ORDER.length : found;
  };
  return [...bands].sort(
    (a, b) => at(a.experienceLabel) - at(b.experienceLabel),
  );
}

type PeerRow = {
  positionSlug: string;
  positionName: string;
  avgMonthly: number | null;
};

/** Vị trí đang xem LUÔN có mặt kể cả khi không lọt top — thiếu nó thì bảng xếp hạng không nói được người đọc đang đứng ở đâu. */
export function rankPeers(rows: PeerRow[], currentSlug: string, limit: number) {
  const rankOf = new Map(rows.map((row, at) => [row.positionSlug, at + 1]));
  const currentRank = rankOf.get(currentSlug);

  const shown = rows.slice(0, limit);
  if (currentRank !== undefined && currentRank > limit) {
    shown.push(rows[currentRank - 1]);
  }

  return shown.map((row) => ({
    ...row,
    rank: rankOf.get(row.positionSlug)!,
    isCurrent: row.positionSlug === currentSlug,
  }));
}
