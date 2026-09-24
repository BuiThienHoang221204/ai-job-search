import { stripNoise } from '../../jobs/taxonomy/dedupe.js';
import { normalizeText } from '../../jobs/taxonomy/resolve.js';
import { SUB_OCCUPATION_POSITIONS } from './sub-occupation-map.js';
import type {
  IndexedPosition,
  PositionIndex,
  ReferencePosition,
  ResolvedPosition,
} from '../salary.types.js';

/** Phải khớp 80% số từ của TÊN VỊ TRÍ, không phải của tên tin — tin dài lê thê vẫn khớp đúng, còn tên vị trí ngắn thì khó khớp bừa. */
export const TITLE_MATCH_THRESHOLD = 0.8;
/** Chặn dưới tuyệt đối: khớp 1/1 từ vẫn đạt 100% tỉ lệ, mà một từ trùng thì gần như chắc chắn là trùng bừa. */
export const MIN_MATCHED_TOKENS = 2;

/** Từ mô tả điều kiện tuyển, không mô tả NGHỀ — để lại thì "Kế toán 2 năm kinh nghiệm" không khớp được "Kế toán". */
const ROLE_NOISE = [
  'kinh nghiem',
  'tot nghiep',
  'di lam',
  'thu nhap',
  'luong cung',
  'khong yeu cau',
  'yeu cau',
  'uu tien',
  'so luong',
  'phuc loi',
  'senior',
  'junior',
  'middle',
  'fresher',
  'intern',
  'all level',
];

/** Dấu mở đầu phần phụ của tên tin: địa điểm, mức lương, cấp bậc. */
const HEAD_SEPARATORS = /[-–—([|/,]/;

/** Đầu ngắn hơn mức này thì dấu phân tách đó không phải ranh giới thật — "C# Developer" cắt ở "-" sẽ ra "C". */
const MIN_HEAD_LENGTH = 3;

/** Cắt đuôi sau dấu gạch/ngoặc: "Kế toán tổng hợp (Hà Nội)" phải khớp như "Kế toán tổng hợp". Đầu quá ngắn thì giữ cả tên. */
function roleHead(title: string): string {
  const head = title.split(HEAD_SEPARATORS)[0];
  return head.trim().length >= MIN_HEAD_LENGTH ? head : title;
}

/** Bỏ CỤM nguyên từ chứ không phải chuỗi con — đệm khoảng trắng hai đầu để "senior" không ăn mất một từ chứa nó. */
function dropPhrases(normalized: string, phrases: string[]): string {
  let text = ` ${normalized} `;
  for (const phrase of phrases) text = text.split(` ${phrase} `).join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Tên vị trí thành danh sách từ để đối chiếu. Bỏ từ một ký tự vì chúng khớp bừa với mọi tên. */
export function roleTokens(value: string): string[] {
  return dropPhrases(stripNoise(normalizeText(value)), ROLE_NOISE)
    .split(' ')
    .filter((token) => token.length > 1);
}

/** Tách từ SẴN cho mọi vị trí, một lần. Dò lúc có request thì mỗi lần tra là một lượt tách cả bảng lương. */
export function buildPositionIndex(rows: ReferencePosition[]): PositionIndex {
  const byOccupation = new Map<string, IndexedPosition[]>();
  const bySlug = new Map<string, ReferencePosition>();

  for (const position of rows) {
    bySlug.set(position.positionSlug, position);
    if (!position.occupationCode) continue;

    const entry = { position, tokens: roleTokens(position.positionName) };
    const bucket = byOccupation.get(position.occupationCode);
    if (bucket) bucket.push(entry);
    else byOccupation.set(position.occupationCode, [entry]);
  }

  return { byOccupation, bySlug };
}

/** Điểm = tỉ lệ từ của TÊN VỊ TRÍ được tin phủ. Hoà điểm thì chọn tên dài hơn — cụ thể hơn thì đúng hơn. */
function matchByTitle(
  title: string,
  occupationCode: string,
  index: PositionIndex,
): ReferencePosition | null {
  const candidates = index.byOccupation.get(occupationCode);
  if (!candidates?.length) return null;

  const titleTokens = new Set(roleTokens(roleHead(title)));
  let best: IndexedPosition | null = null;
  let bestScore = 0;
  let bestOverlap = 0;

  for (const candidate of candidates) {
    if (candidate.tokens.length === 0) continue;

    const overlap = candidate.tokens.filter((token) =>
      titleTokens.has(token),
    ).length;
    const score = overlap / candidate.tokens.length;

    const moreSpecific =
      score === bestScore &&
      score > 0 &&
      best !== null &&
      candidate.tokens.length > best.tokens.length;

    if (score > bestScore || moreSpecific) {
      best = candidate;
      bestScore = score;
      bestOverlap = overlap;
    }
  }

  if (
    !best ||
    bestScore < TITLE_MATCH_THRESHOLD ||
    bestOverlap < MIN_MATCHED_TOKENS
  ) {
    return null;
  }
  return best.position;
}

/** Đường lùi bằng bảng ánh xạ tay khi không dò được tên. Slug không có trong kho thì bỏ qua, không ném. */
function matchBySubOccupation(
  subOccupationCode: string,
  index: PositionIndex,
): ReferencePosition[] {
  const slugs = SUB_OCCUPATION_POSITIONS[subOccupationCode];
  if (!slugs?.length) return [];

  const positions: ReferencePosition[] = [];
  for (const slug of slugs) {
    const position = index.bySlug.get(slug);
    if (position) positions.push(position);
  }
  return positions;
}

/** Ưu tiên khớp ĐÚNG một vị trí; không được thì gộp cả nhóm nghề; vẫn không được thì `null` chứ không đoán. */
export function resolveJobPosition(
  job: {
    title: string;
    occupationCode: string | null;
    subOccupationCode: string | null;
  },
  index: PositionIndex,
): ResolvedPosition | null {
  if (job.occupationCode) {
    const exact = matchByTitle(job.title, job.occupationCode, index);
    if (exact) {
      return {
        basis: 'POSITION',
        label: exact.positionName,
        positions: [exact],
      };
    }
  }

  if (job.subOccupationCode) {
    const group = matchBySubOccupation(job.subOccupationCode, index);
    if (group.length > 0) {
      return {
        basis: 'SUB_OCCUPATION',
        label: group.map((position) => position.positionName).join(', '),
        positions: group,
      };
    }
  }

  return null;
}
