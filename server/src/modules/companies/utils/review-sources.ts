import type { SearchHit } from '../../../common/web/serper.js';

export type { SearchHit };

/** Trang có đánh giá của người đi làm. Vị trí trong mảng là thứ hạng ưu tiên. */
const REVIEW_HOSTS = [
  'itviec.com',
  'reviewcongty.com',
  'reviewtopcongty.com',
  'glassdoor.com',
  'topcv.vn',
  'vietnamworks.com',
  'careerbuilder.vn',
  'careerlink.vn',
  'jobsgo.vn',
  'indeed.com',
];

/** Đăng nhập mới đọc được, hoặc nội dung là video - tải về chỉ nhận khung rỗng. */
const BLOCKED_HOSTS = [
  'facebook.com',
  'instagram.com',
  'threads.net',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'x.com',
  'twitter.com',
];

/** Đường dẫn của MỘT tin tuyển dụng, không phải trang công ty. */
const JOB_PATHS = [
  /\/it-jobs\//,
  /\/viec-lam/,
  /\/tim-viec/,
  /\/tuyen-dung\//,
  /\/jobs?\//,
  /\/job-detail/,
];

/** Tên miền đã bỏ `www.`, hoặc `null` khi URL không dùng được. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Khớp cả tên miền con: `vn.indeed.com` vẫn là `indeed.com`. */
function matches(host: string, known: string): boolean {
  return host === known || host.endsWith(`.${known}`);
}

/** Chặn tải nhưng đoạn trích vẫn đáng đọc: nhóm Facebook là nơi người Việt hỏi nhau. */
const SNIPPET_HOSTS = ['facebook.com', 'threads.net'];

/** Đoạn trích ngắn hơn mức này chỉ là tiêu đề lặp lại, không phải nội dung. */
const MIN_SNIPPET = 60;

/** Nguồn không tải được nhưng đoạn trích đã trả tiền rồi. Mỗi tên miền một mục. */
export function pickSnippetSources(hits: SearchHit[], limit = 2): SearchHit[] {
  const seen = new Set<string>();
  const picked: SearchHit[] = [];

  for (const hit of hits) {
    if (hit.snippet.length < MIN_SNIPPET) continue;
    const host = hostOf(hit.url);
    if (!host || seen.has(host)) continue;
    if (!SNIPPET_HOSTS.some((known) => matches(host, known))) continue;

    seen.add(host);
    picked.push(hit);
    if (picked.length === limit) break;
  }

  return picked;
}

/** Nguồn có phải trang đánh giá chuyên hay chỉ là một kết quả Google bất kỳ. */
export function isReviewHost(url: string): boolean {
  const host = hostOf(url);
  return host !== null && REVIEW_HOSTS.some((known) => matches(host, known));
}

function rankOf(host: string): number {
  const index = REVIEW_HOSTS.findIndex((known) => matches(host, known));
  return index === -1 ? REVIEW_HOSTS.length : index;
}

/** Chọn trang đáng tải, mỗi tên miền một trang. Lọc bài PR là việc của model. */
export function pickReviewSources(hits: SearchHit[], limit = 5): SearchHit[] {
  const eligible: Array<{ hit: SearchHit; host: string; order: number }> = [];

  for (const [order, hit] of hits.entries()) {
    const host = hostOf(hit.url);
    if (!host) continue;
    if (BLOCKED_HOSTS.some((blocked) => matches(host, blocked))) continue;
    if (JOB_PATHS.some((pattern) => pattern.test(new URL(hit.url).pathname))) {
      continue;
    }
    eligible.push({ hit, host, order });
  }

  eligible.sort((a, b) => rankOf(a.host) - rankOf(b.host) || a.order - b.order);

  const seen = new Set<string>();
  const picked: SearchHit[] = [];
  for (const entry of eligible) {
    if (seen.has(entry.host)) continue;
    seen.add(entry.host);
    picked.push(entry.hit);
    if (picked.length === limit) break;
  }

  return picked;
}

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

/** Banner cookie và điều khoản: đo trên TopCV chiếm phần lớn 9.263 ký tự. */
const CHROME_LINE =
  /cookie|quyền riêng tư|chấp nhận tất cả|từ chối tất cả|điều khoản sử dụng|chính sách bảo mật|tải ứng dụng|privacy polic|terms of (use|service)/i;

/** Bỏ những dòng không bao giờ là nội dung về nơi làm việc. */
export function stripChrome(text: string): string {
  return text
    .split('\n')
    .filter((line) => !CHROME_LINE.test(line))
    .join('\n');
}

/** Giữ phần nói về nơi làm việc, chọn theo MẬT ĐỘ từ khoá chứ không theo thứ tự trang. */
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

export type BriefConfidence = 'high' | 'medium' | 'low';

/** Suy từ số nguồn đọc được, không hỏi model. Một trang chuyên nặng hơn ba blog. */
export function confidenceOf(urls: string[]): BriefConfidence {
  const total = urls.length;
  const known = urls.filter(isReviewHost).length;

  if (total === 0) return 'low';
  if (known >= 1 && total >= 2) return 'high';
  if (known >= 1 || total >= 3) return 'medium';
  return 'low';
}
