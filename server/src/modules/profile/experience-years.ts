const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

const OPEN_ENDED = ['present', 'current', 'now', 'nay', 'hien tai', 'den nay'];
const RANGE_SPLIT = /\s*(?:[-–—]|to|den|toi)\s*/;

const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** Số tháng tuyệt đối tính từ năm 0, để trừ hai mốc ra khoảng cách. */
type Milestone = number;

type Span = { from: Milestone; to: Milestone };

/** Đọc một mốc thời gian; `null` khi không chắc. */
function parseMilestone(raw: string, now: Date): Milestone | null {
  const text = fold(raw);
  if (!text) return null;
  if (OPEN_ENDED.some((word) => text.includes(word))) {
    return now.getFullYear() * 12 + now.getMonth();
  }

  const slash = /^(?:thang\s*)?(\d{1,2})\s*[/.]\s*(\d{4})$/.exec(text);
  if (slash) {
    const month = Number(slash[1]);
    if (month < 1 || month > 12) return null;
    return Number(slash[2]) * 12 + (month - 1);
  }

  const named = /^([a-z]{3,})\.?\s+(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3));
    if (month < 0) return null;
    return Number(named[2]) * 12 + month;
  }

  const yearOnly = /^(\d{4})$/.exec(text);
  if (yearOnly) return Number(yearOnly[1]) * 12;

  return null;
}

function parseSpan(period: unknown, now: Date): Span | null {
  if (typeof period !== 'string') return null;

  const parts = period.split(RANGE_SPLIT).filter(Boolean);
  if (parts.length !== 2) return null;

  const from = parseMilestone(parts[0], now);
  const to = parseMilestone(parts[1], now);
  if (from === null || to === null || to < from) return null;

  return { from, to };
}

/** Gộp khoảng chồng lấn rồi cộng: làm hai việc song song không thành gấp đôi. */
function totalMonths(spans: Span[]): number {
  const sorted = [...spans].sort((a, b) => a.from - b.from);

  let months = 0;
  let cursor = -1;

  for (const span of sorted) {
    const from = Math.max(span.from, cursor);
    if (span.to > from) months += span.to - from;
    cursor = Math.max(cursor, span.to);
  }

  return months;
}

/**
 * Số năm kinh nghiệm suy từ `Profile.experiences`, `null` khi có mục đọc không
 * chắc.
 *
 * Bỏ qua mục hỏng rồi vẫn trả một con số là kiểu sai nguy hiểm hơn: nó ra số
 * nhỏ hơn sự thật mà trông vẫn đáng tin, và loại người dùng khỏi tin đòi kinh
 * nghiệm mà không ai biết vì sao.
 */
export function yearsOfExperience(
  experiences: unknown,
  now: Date = new Date(),
): number | null {
  if (!Array.isArray(experiences) || experiences.length === 0) return null;

  const spans: Span[] = [];
  for (const entry of experiences) {
    if (typeof entry !== 'object' || entry === null) return null;
    const span = parseSpan((entry as { period?: unknown }).period, now);
    if (!span) return null;
    spans.push(span);
  }

  return Math.round((totalMonths(spans) / 12) * 10) / 10;
}
