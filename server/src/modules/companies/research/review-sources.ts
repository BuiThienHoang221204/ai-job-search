/** Một dòng kết quả tìm kiếm, cùng hình dạng với `SearchHit` của web-search.tool. */
export type SearchHit = { title: string; url: string; snippet: string };

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

/**
 * Chặn tải được nhưng đoạn trích Google vẫn đáng đọc. Nhóm Facebook là nơi
 * người Việt hỏi nhau về công ty - đo trên "Công ty TNHH Smartbooks", bài
 * "Có ai đã phỏng vấn ở đây chưa ạ?" là tín hiệu người-thật DUY NHẤT tồn tại.
 */
const SNIPPET_HOSTS = ['facebook.com', 'threads.net'];

/** Đoạn trích ngắn hơn mức này chỉ là tiêu đề lặp lại, không phải nội dung. */
const MIN_SNIPPET = 60;

/**
 * Nguồn không tải được nhưng đoạn trích đã trả tiền rồi, bỏ đi là phí.
 * Mỗi tên miền một mục, giống `pickReviewSources`.
 */
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

/**
 * Chọn những trang đáng tải trong danh sách Google trả về, mỗi tên miền một
 * trang. Phân biệt đánh giá thật với bài PR là việc của model ở bước tổng hợp,
 * không phải của bộ lọc URL.
 */
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
