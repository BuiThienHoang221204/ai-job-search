/** Từ khoá đánh dấu đoạn nói về nơi làm việc. Có cả bản không dấu vì nhiều trang viết vậy. */
const REVIEW_HINTS = [
  'đánh giá',
  'danh gia',
  'nhận xét',
  'review',
  'nhân viên',
  'nhan vien',
  'môi trường',
  'moi truong',
  'phúc lợi',
  'phuc loi',
  'lương',
  'luong',
  'đồng nghiệp',
  'dong nghiep',
  'quản lý',
  'quan ly',
  'sếp',
  'văn hóa',
  'van hoa',
  'tăng ca',
  'nghỉ việc',
  'recommend',
  'salary',
  'benefit',
  'culture',
  'management',
];

const BEFORE = 300;
const AFTER = 500;
const SEPARATOR = '\n…\n';

/** Số lần khớp tối đa cho mỗi từ khoá, chặn trang lặp một chữ hàng nghìn lần. */
const MAX_HITS_PER_HINT = 20;

function hintPositions(lower: string): number[] {
  const positions: number[] = [];

  for (const hint of REVIEW_HINTS) {
    let from = 0;
    for (let count = 0; count < MAX_HITS_PER_HINT; count++) {
      const at = lower.indexOf(hint, from);
      if (at === -1) break;
      positions.push(at);
      from = at + hint.length;
    }
  }

  return positions.sort((a, b) => a - b);
}

type Window = { start: number; end: number; hits: number };

/** Gộp các cửa sổ chồng lấn, đếm luôn số từ khoá rơi vào mỗi đoạn. */
function mergeWindows(positions: number[], length: number): Window[] {
  const merged: Window[] = [];

  for (const at of positions) {
    const start = Math.max(0, at - BEFORE);
    const end = Math.min(length, at + AFTER);
    const last = merged[merged.length - 1];

    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      last.hits += 1;
      continue;
    }
    merged.push({ start, end, hits: 1 });
  }

  return merged;
}

/**
 * Banner đồng ý cookie và khối điều khoản. Trang công ty của TopCV đo được
 * 9.263 ký tự mà phần lớn là hai thứ này, đủ để đẩy nội dung thật ra khỏi
 * ngân sách.
 */
const CHROME_LINE =
  /cookie|quyền riêng tư|chấp nhận tất cả|từ chối tất cả|điều khoản sử dụng|chính sách bảo mật|tải ứng dụng|privacy polic|terms of (use|service)/i;

/** Bỏ những dòng không bao giờ là nội dung về nơi làm việc. */
export function stripChrome(text: string): string {
  return text
    .split('\n')
    .filter((line) => !CHROME_LINE.test(line))
    .join('\n');
}

/**
 * Giữ lại phần trang nói về nơi làm việc, bỏ menu và tin tuyển dụng gợi ý.
 *
 * Chọn theo MẬT ĐỘ từ khoá, không theo thứ tự trang. Chọn theo thứ tự đã đo là
 * hỏng: khẩu hiệu đầu trang TopCV ("Kết nối bền chặt cùng đồng nghiệp…") chứa
 * đúng một từ khoá và nằm trên cùng, nên nó chiếm hết ngân sách trước khi tới
 * phần nội dung thật. Một đoạn đánh giá thật có hàng chục từ khoá trên cùng độ
 * dài, nên mật độ tách được hai thứ đó còn thứ tự thì không.
 *
 * Không tìm thấy từ khoá nào thì cắt từ đầu trang chứ không trả rỗng: có thể là
 * một trang thật viết theo cách chưa lường được, và đưa thiếu vào model còn hơn
 * đưa trắng.
 */
export function trimToReviewText(raw: string, budget = 5_000): string {
  const text = stripChrome(raw);
  if (text.length <= budget) return text;

  const windows = mergeWindows(hintPositions(text.toLowerCase()), text.length);
  if (windows.length === 0) return text.slice(0, budget);

  const kept: Window[] = [];
  let used = 0;

  for (const window of [...windows].sort((a, b) => b.hits - a.hits)) {
    const gap = kept.length > 0 ? SEPARATOR.length : 0;
    const remaining = budget - used - gap;
    if (remaining <= 0) break;

    kept.push({
      ...window,
      end: Math.min(window.end, window.start + remaining),
    });
    used += kept[kept.length - 1].end - window.start + gap;
  }

  return kept
    .sort((a, b) => a.start - b.start)
    .map((w) => text.slice(w.start, w.end).trim())
    .join(SEPARATOR);
}
