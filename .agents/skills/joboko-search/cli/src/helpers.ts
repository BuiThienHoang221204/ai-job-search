export const BASE_URL = "https://vn.joboko.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi,en;q=0.9",
}

/** Portal trả trang thử thách thay cho nội dung. Backend nhận mã BLOCKED và tạm ngừng gọi portal này - KHÔNG tìm cách giải. */
export class BlockedError extends Error {}

/** Dấu hiệu thử thách chống bot. `g-recaptcha` MỘT MÌNH không đủ: form "Góp ý"/"Báo cáo tin" trên MỌI trang JobOKO đều có widget đó. */
const CHALLENGE = /hcaptcha\.com|g-recaptcha|challenges\.cloudflare\.com|<title>Just a moment/i

/** Có nội dung thật: thẻ tin hoặc JSON-LD của một tin. */
const HAS_CONTENT = /<h2 class="item-title">|"JobPosting"/

/** Trang chặn = có dấu hiệu thử thách VÀ không có nội dung thật. Trang chặn thường vẫn là HTTP 200 (xem careerlink-search). */
export const isBlockedPage = (html: string): boolean => CHALLENGE.test(html) && !HAS_CONTENT.test(html)

/** Tải HTML, lùi dần khi gặp 403/429/5xx. Trả "" khi 404 - trang từ khoá không có sẵn thì 404, đó là tín hiệu chứ không phải lỗi. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 3
  let delay = 1_000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(25_000),
    })

    if (response.status === 404) return ""
    if (response.ok) {
      const html = await response.text()
      // Không thử lại: gọi thêm khi đang bị chặn chỉ kéo dài thời gian bị chặn.
      if (isBlockedPage(html)) {
        throw new BlockedError("JobOKO trả trang chặn thay vì dữ liệu; tạm dừng quét portal này")
      }
      return html
    }

    const retryable =
      response.status === 429 || response.status === 403 || response.status >= 500
    if (!retryable || attempt === maxRetries) {
      throw new Error(`JobOKO trả về ${response.status}`)
    }
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    delay *= 2
  }

  throw new Error("không thể tải trang")
}

export interface JobCard {
  /** Số sau "xvi" trong đường dẫn, ổn định, dùng làm externalId. */
  id: string
  /** Dạng "viec-lam-<ten-tin>-xvi<id>" - đúng đường dẫn trang chi tiết. */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  companyLogo: string | null
  location: string | null
  workMode: string | null
  /** "Thỏa thuận"/"Thương lượng" được trả về null. */
  salary: string | null
  /** Thẻ tìm kiếm KHÔNG có ngày đăng - ngày trên thẻ là HẠN NỘP. `detail` trả `datePosted` thật. */
  postedAt: string | null
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

export const nfc = (text: string): string => text.normalize("NFC")

/** Bỏ dấu, chữ thường, gom mọi thứ không phải chữ số thành một khoảng trắng, bọc hai đầu - dạng so khớp theo RANH GIỚI TỪ. */
export const fold = (text: string): string =>
  ` ${text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `

export const slugify = (text: string): string => fold(text).trim().replace(/ /g, "-")

const containsPhrase = (haystack: string, phrase: string): number =>
  fold(haystack).indexOf(fold(phrase))

export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#39": "'",
    nbsp: " ",
  }
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase()
    if (key in named) return named[key]!
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16))
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10))
    return match
  })
}

const stripTags = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")

/** Giải thực thể SAU khi bỏ thẻ, để `&lt;p&gt;` trong chữ không thành thẻ rồi bị xoá. */
export const clean = (html: string): string =>
  nfc(decodeEntities(stripTags(html)))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/** Cắt trang thành từng thẻ tin theo mốc `<h2 class="item-title">`; phần trước mốc đầu tiên bỏ đi. */
export function splitJobCards(html: string): string[] {
  const marker = '<h2 class="item-title">'
  const cards: string[] = []
  let index = html.indexOf(marker)
  while (index !== -1) {
    const next = html.indexOf(marker, index + marker.length)
    cards.push(next === -1 ? html.slice(index) : html.slice(index, next))
    index = next
  }
  return cards
}

const textOf = (fragment: string | undefined): string | null =>
  fragment ? clean(fragment) || null : null

/** Phần lớn thẻ lazy-load ảnh: `<img class="lazy" src="data:image/gif;base64,..." data-lazy="URL_THẬT">`. `src` lúc đó chỉ là ảnh giữ chỗ rỗng - logo thật nằm ở `data-lazy`. */
const logoOf = (card: string): string | null => {
  const block = card.match(/<div class="item-logo">([\s\S]*?)<\/div>/)?.[1]
  if (!block) return null
  return block.match(/data-lazy="([^"]+)"/)?.[1] ?? block.match(/\ssrc="(https?:\/\/[^"]+)"/)?.[1] ?? null
}

/** Lương không phải con số trả null như các portal khác. */
export const salaryOf = (text: string | null): string | null =>
  text && !/thỏa thuận|thoả thuận|thương lượng|cạnh tranh/i.test(text) ? text : null

export function parseJobCard(card: string): JobCard | null {
  const link = card.match(/<h2 class="item-title"><a href="\/(viec-lam-[a-z0-9-]+-xvi(\d+))"[^>]*>([^<]+)<\/a>/)
  if (!link) return null
  const [, slug, id, rawTitle] = link
  const title = nfc(decodeEntities(rawTitle!)).trim()
  if (!title) return null

  return {
    id: id!,
    slug: slug!,
    title,
    company: textOf(card.match(/<div class="item-company[^"]*"><span[^>]*>([\s\S]*?)<\/span>/)?.[1]),
    companyUrl: null,
    companyLogo: logoOf(card),
    location: textOf(card.match(/<div class="item-address"><span[^>]*>([\s\S]*?)<\/span>/)?.[1]),
    workMode: null,
    salary: salaryOf(textOf(card.match(/<div class="item-rate"><span[^>]*>([\s\S]*?)<\/span>/)?.[1])),
    postedAt: null,
    tags: [],
    url: `${BASE_URL}/${slug}`,
  }
}

export function parseJobCards(html: string): JobCard[] {
  const seen = new Set<string>()
  return splitJobCards(html)
    .map(parseJobCard)
    .filter((card): card is JobCard => {
      if (!card || seen.has(card.id)) return false
      seen.add(card.id)
      return true
    })
}

/** Tin đã hết hạn: trang vẫn trả 200 nhưng BỎ JSON-LD. Báo mã riêng để log không đọc thành "CLI hỏng" hay "tin không tồn tại". */
export class ExpiredError extends Error {}

export const isExpiredPage = (html: string): boolean =>
  !html.includes('"JobPosting"') && /đã hết hạn nộp hồ sơ/i.test(html)

export type JobPosting = {
  title?: string
  description?: string
  datePosted?: string
  hiringOrganization?: { name?: string; sameAs?: string; logo?: string }
  jobLocation?: unknown
  baseSalary?: { value?: { value?: unknown; minValue?: number; maxValue?: number } }
  industry?: string
}

export function parseJobPosting(html: string): JobPosting | null {
  for (const [, body] of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let parsed: unknown
    try {
      parsed = JSON.parse(body!)
    } catch {
      continue
    }
    const nodes = Array.isArray(parsed)
      ? parsed
      : ((parsed as { "@graph"?: unknown[] })["@graph"] ?? [parsed])
    for (const node of nodes) {
      if ((node as { "@type"?: string })["@type"] === "JobPosting") return node as JobPosting
    }
  }
  return null
}

/** Khối mô tả được giữ; "Quyền lợi", "Thông tin chung", "Nơi làm việc" không giúp rút kỹ năng. */
const DESCRIPTION_SECTIONS = [" mo ta cong viec ", " yeu cau "]

/** `description` của JSON-LD là HTML có sẵn tiêu đề `<h3>` từng khối; chỉ giữ mô tả + yêu cầu, và GIỮ tiêu đề. */
export function describePosting(posting: JobPosting | null): string | null {
  const html = posting?.description
  if (!html) return null
  const parts = html.split(/(?=<h3[^>]*>)/)
  const kept = parts
    .map((part) => {
      const heading = part.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]
      if (!heading || !DESCRIPTION_SECTIONS.includes(fold(heading))) return ""
      const text = clean(part.slice(part.indexOf("</h3>") + 5))
      return text.length > 10 ? `${clean(heading)}\n${text}` : ""
    })
    .filter(Boolean)
  // Không tách được khối nào (trang đổi markup) thì trả cả mô tả thay vì mất trắng.
  return kept.length ? kept.join("\n\n") : clean(html) || null
}

/** Lương trong JSON-LD của JobOKO là CHUỖI ("14 - 18 triệu VND"), không phải số. */
export function salaryFromPosting(posting: JobPosting | null): string | null {
  const value = posting?.baseSalary?.value?.value
  return typeof value === "string" ? salaryOf(nfc(value).trim() || null) : null
}

export function locationFromPosting(posting: JobPosting | null): string | null {
  const places = [posting?.jobLocation].flat() as Array<{
    address?: { addressRegion?: string; addressLocality?: string }
  } | undefined>
  const regions = places
    .map((place) => place?.address?.addressRegion ?? place?.address?.addressLocality)
    .filter((region): region is string => Boolean(region))
    .map((region) => nfc(region).trim())
  return regions.length ? [...new Set(regions)].join(", ") : null
}

/**
 * JobOKO KHÔNG tìm được theo từ khoá tự do trong phạm vi robots.txt cho phép:
 * robots.txt chặn `/jobs?*` và `/viec-lam-theo-khoa?*` - hai đường tìm kiếm.
 * Còn lại hai đường được phép (đo 2026-09-30):
 *   - Trang từ khoá `/tim-viec-lam-<cụm>`, CHỈ có với cụm biên tập sẵn:
 *     "kế toán tổng hợp" 20/20 tin đúng, "kế toán" và "frontend developer" 404.
 *   - Trang ngành `/viec-lam-nganh-<slug>-xni<id>` (111 ngành), 10 tin/trang,
 *     phân trang `?p=N`: trang "Kế toán" 9/10 tin đúng, trang 2 trùng 0/10.
 *
 * Bảng dưới lấy từ chính 111 ngành của trang, chọn ngành HẸP khi có (Kế toán
 * xni32 thay cho "Tài chính / Kế toán" xni122). `phrases` so theo ranh giới từ.
 */
export const INDUSTRIES: ReadonlyArray<{ id: number; slug: string; phrases: string[] }> = [
  { id: 32, slug: "ke-toan-kiem-toan", phrases: ["kế toán", "accountant", "accounting"] },
  { id: 132, slug: "kiem-toan", phrases: ["kiểm toán", "audit", "auditor"] },
  { id: 46, slug: "ngan-hang-tai-chinh", phrases: ["ngân hàng", "tài chính", "tín dụng", "giao dịch viên", "finance", "banking"] },
  { id: 7, slug: "chung-khoan-vang", phrases: ["chứng khoán"] },
  { id: 3, slug: "bao-hiem-tu-van-bao-hiem", phrases: ["bảo hiểm"] },
  {
    id: 30,
    slug: "it-phan-mem",
    phrases: [
      "phần mềm", "lập trình", "lập trình viên", "developer", "software", "frontend", "front end",
      "backend", "back end", "fullstack", "full stack", "mobile", "android", "ios", "reactjs",
      "react", "nodejs", "java", "python", "php", "golang", ".net", "devops", "tester", "kiểm thử",
    ],
  },
  { id: 29, slug: "it-phan-cung-mang", phrases: ["phần cứng", "quản trị mạng", "network", "helpdesk", "it support", "system admin"] },
  { id: 104, slug: "thong-ke", phrases: ["thống kê", "data analyst", "phân tích dữ liệu", "data engineer"] },
  { id: 51, slug: "nhan-vien-kinh-doanh", phrases: ["kinh doanh", "sales", "telesales", "phát triển thị trường"] },
  { id: 1, slug: "ban-hang", phrases: ["bán hàng", "tư vấn bán hàng", "cửa hàng"] },
  { id: 73, slug: "tu-van-cham-soc-khach-hang", phrases: ["chăm sóc khách hàng", "cskh", "customer service", "tổng đài"] },
  { id: 42, slug: "marketing-pr", phrases: ["marketing", "pr", "seo", "digital marketing", "content"] },
  { id: 110, slug: "copywriter", phrases: ["copywriter"] },
  { id: 50, slug: "nhan-su", phrases: ["nhân sự", "tuyển dụng", "hr"] },
  { id: 26, slug: "hanh-chinh-van-phong", phrases: ["hành chính", "văn phòng"] },
  { id: 67, slug: "thu-ky-tro-ly", phrases: ["thư ký", "trợ lý"] },
  { id: 109, slug: "le-tan", phrases: ["lễ tân"] },
  { id: 54, slug: "phap-luat-phap-ly", phrases: ["luật", "pháp lý", "pháp chế", "luật sư"] },
  { id: 5, slug: "bien-dich-phien-dich-ngoai-ngu", phrases: ["biên dịch", "phiên dịch", "thông dịch"] },
  { id: 21, slug: "giao-duc-dao-tao", phrases: ["giáo dục", "đào tạo", "giáo viên", "giảng viên", "gia sư", "teacher", "trợ giảng"] },
  { id: 82, slug: "y-te-duoc", phrases: ["y tế", "dược", "dược sĩ", "điều dưỡng", "y tá", "bác sĩ", "xét nghiệm", "hộ lý"] },
  { id: 94, slug: "cham-soc-suc-khoe", phrases: ["chăm sóc sức khỏe"] },
  { id: 39, slug: "lam-dep-the-luc-spa", phrases: ["làm đẹp", "spa", "thẩm mỹ"] },
  { id: 79, slug: "xay-dung", phrases: ["xây dựng", "giám sát công trình", "công trình", "qs", "kỹ sư xây dựng"] },
  { id: 34, slug: "kien-truc-thiet-ke-noi-that", phrases: ["kiến trúc", "nội thất"] },
  { id: 8, slug: "co-khi-che-tao", phrases: ["cơ khí", "chế tạo", "cnc"] },
  { id: 17, slug: "dien-dien-tu-dien-lanh", phrases: ["điện", "điện tử", "điện lạnh", "kỹ sư điện"] },
  { id: 53, slug: "o-to-xe-may", phrases: ["ô tô", "xe máy"] },
  { id: 84, slug: "san-xuat-van-hanh-san-xuat", phrases: ["sản xuất", "vận hành sản xuất", "công nhân"] },
  { id: 92, slug: "bao-tri-sua-chua", phrases: ["bảo trì", "sửa chữa"] },
  { id: 57, slug: "qa-qc-tham-dinh-giam-dinh", phrases: ["qa qc", "kiểm soát chất lượng", "chất lượng", "qc"] },
  { id: 91, slug: "an-toan-lao-dong", phrases: ["an toàn lao động", "hse", "ehs"] },
  { id: 80, slug: "xuat-nhap-khau", phrases: ["xuất nhập khẩu", "import export"] },
  { id: 22, slug: "giao-nhan-van-chuyen-kho-bai", phrases: ["giao nhận", "kho", "thủ kho", "logistics", "kho bãi", "chuỗi cung ứng", "supply chain"] },
  { id: 76, slug: "vat-tu-thiet-bi-mua-hang", phrases: ["mua hàng", "thu mua", "vật tư"] },
  { id: 74, slug: "van-tai-lai-xe-tai-xe", phrases: ["lái xe", "tài xế", "vận tải", "giao hàng", "shipper"] },
  { id: 33, slug: "khach-san-nha-hang", phrases: ["khách sạn", "nhà hàng", "phục vụ", "bếp", "đầu bếp", "pha chế", "barista"] },
  { id: 15, slug: "du-lich", phrases: ["du lịch", "hướng dẫn viên"] },
  { id: 63, slug: "thiet-ke-my-thuat", phrases: ["thiết kế đồ họa", "designer", "graphic design", "ui ux"] },
  { id: 2, slug: "bien-tap-bao-chi-truyen-hinh", phrases: ["biên tập", "báo chí", "phóng viên", "truyền hình"] },
  { id: 35, slug: "bat-dong-san", phrases: ["bất động sản", "môi giới"] },
  { id: 13, slug: "det-may-da-giay", phrases: ["dệt may", "da giày", "may mặc"] },
  { id: 68, slug: "thuc-pham-do-uong", phrases: ["thực phẩm", "đồ uống"] },
  { id: 52, slug: "nong-lam-ngu-nghiep-thuy-san", phrases: ["nông nghiệp", "lâm nghiệp", "thủy sản"] },
  { id: 89, slug: "chan-nuoi-thu-y", phrases: ["chăn nuôi", "thú y"] },
  { id: 43, slug: "moi-truong", phrases: ["môi trường", "xử lý chất thải"] },
  { id: 12, slug: "dau-khi-hoa-chat", phrases: ["dầu khí", "hóa chất"] },
  { id: 40, slug: "lao-dong-pho-thong", phrases: ["lao động phổ thông", "tạp vụ", "phụ việc"] },
  { id: 83, slug: "quan-ly-dieu-hanh", phrases: ["quản lý điều hành", "giám đốc điều hành"] },
  { id: 28, slug: "hoach-dinh-du-an", phrases: ["quản lý dự án", "project manager"] },
  { id: 70, slug: "thuong-mai-dien-tu", phrases: ["thương mại điện tử", "ecommerce", "e commerce"] },
]

/** Chọn MỘT ngành: cụm đứng SỚM NHẤT thắng ("kế toán logistics" là việc kế toán), hoà thì cụm DÀI hơn thắng. */
export function industryFor(query: string): { id: number; slug: string; phrases: string[] } | null {
  let best: { id: number; slug: string; phrases: string[]; at: number; length: number } | null = null
  for (const industry of INDUSTRIES) {
    for (const phrase of industry.phrases) {
      const at = containsPhrase(query, phrase)
      if (at === -1) continue
      const length = fold(phrase).length
      if (!best || at < best.at || (at === best.at && length > best.length)) {
        best = { ...industry, at, length }
      }
    }
  }
  return best ? { id: best.id, slug: best.slug, phrases: best.phrases } : null
}

export const keywordUrl = (slug: string): string => `${BASE_URL}/tim-viec-lam-${slug}`

export function industryUrl(industry: { id: number; slug: string }, page?: number): string {
  const base = `${BASE_URL}/viec-lam-nganh-${industry.slug}-xni${industry.id}`
  return page && page > 1 ? `${base}?p=${page}` : base
}

/** Các cụm từ khoá thử lần lượt: cả cụm, rồi cụm HAI từ đầu. Tối đa hai lần vì mỗi lần hụt là một request 404. */
export function keywordCandidates(query: string): string[] {
  const words = fold(query).trim().split(" ").filter(Boolean)
  if (words.length < 2) return []
  const full = words.join("-")
  const short = words.slice(0, 2).join("-")
  return full === short ? [full] : [full, short]
}

/** Bỏ tin mà chức danh không chứa cụm nào của từ khoá hay của ngành đã chọn - trang "điều dưỡng" chỉ 9/20 tin đúng. */
export function relevantTo(card: JobCard, query: string, phrases: readonly string[]): boolean {
  return [query, ...phrases].some((phrase) => containsPhrase(card.title, phrase) !== -1)
}

/** Tin có chữ của từ khoá trong chức danh lên đầu, giữ thứ tự gốc khi hoà. */
export function rankByQuery(cards: JobCard[], query: string): JobCard[] {
  const words = fold(query).trim().split(" ").filter((word) => word.length > 1)
  const score = (card: JobCard) => words.filter((word) => fold(card.title).includes(` ${word} `)).length
  return cards
    .map((card, index) => ({ card, index, score: score(card) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ card }) => card)
}

const PLACE_ALIASES: Array<[RegExp, string]> = [
  [/ (tp )?hcm | tphcm | sai gon | thanh pho ho chi minh /g, " ho chi minh "],
]

const place = (text: string): string => {
  let folded = fold(text)
  for (const [pattern, canonical] of PLACE_ALIASES) folded = folded.replace(pattern, canonical)
  return folded
}

const COUNTRY_WIDE = new Set([" vietnam ", " viet nam ", " vn "])

/** So khớp địa điểm không dấu, hiểu các cách viết TP.HCM; tên quốc gia nghĩa là "cả nước". */
export function matchesLocation(jobLocation: string | null, wanted: string): boolean {
  const target = place(wanted)
  if (!target.trim() || COUNTRY_WIDE.has(target)) return true
  if (!jobLocation) return false
  return place(jobLocation).includes(target)
}
