export const BASE_URL = "https://123job.vn"

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

/** Portal chặn. Backend nhận mã BLOCKED và tạm ngừng gọi portal này - KHÔNG tìm cách vượt. */
export class BlockedError extends Error {}

/** Dấu hiệu trang thử thách chống bot. Một widget reCAPTCHA trong form KHÔNG đủ - bẫy đã sập ở joboko-search. */
const CHALLENGE = /hcaptcha\.com|g-recaptcha|challenges\.cloudflare\.com|<title>Just a moment|<title>Attention Required/i

/** Có nội dung thật: thẻ tin trên trang danh sách, hoặc khối mô tả trên trang chi tiết. */
const HAS_CONTENT = /relative flex items-start gap-3|data-collapsible/

/** Trang chặn = có dấu hiệu thử thách VÀ không có nội dung thật; trang chặn thường vẫn là HTTP 200 (xem ADR 0005). */
export const isBlockedPage = (html: string): boolean => CHALLENGE.test(html) && !HAS_CONTENT.test(html)

/** 403 là BLOCKED NGAY, không thử lại - cùng bài học của topcv-search và vieclam24h-search. */
export function errorForStatus(status: number): Error {
  return status === 403
    ? new BlockedError("123job chặn (403); tạm dừng quét portal này")
    : new Error(`123job trả về ${status}`)
}

/** Tải HTML, lùi dần khi gặp 429/5xx. Trả "" khi 404. Ném BlockedError khi gặp 403 hoặc trang chặn. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 3
  let delay = 1_000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(30_000),
    })

    if (response.status === 404) return ""
    if (response.ok) {
      const html = await response.text()
      if (isBlockedPage(html)) {
        throw new BlockedError("123job trả trang thử thách thay vì dữ liệu; tạm dừng quét portal này")
      }
      return html
    }

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === maxRetries) throw errorForStatus(response.status)
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    delay *= 2
  }

  throw new Error("không thể tải trang")
}

export interface JobCard {
  /** Mã hash cuối slug (`/viec-lam/<ten-tin>-<hash>`), ổn định, dùng làm externalId. */
  id: string
  /** Dạng "<ten-tin>-<hash>" - đúng đường dẫn `/viec-lam/<slug>`. */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  companyLogo: string | null
  location: string | null
  /** Thẻ 123job không ghi hình thức làm việc. */
  workMode: string | null
  /** "Đang cập nhật"/"Thỏa thuận" được trả về null. */
  salary: string | null
  /** Chuỗi "Đăng" của thẻ, tương đối ("24 giờ trước") - backend tự đổi ra ngày. */
  postedAt: string | null
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  /** Nhãn ngành nghề do nhà tuyển dụng chọn (JSON-LD `industry`, ví dụ "Kế toán - Kiểm toán"), giữ nguyên văn; backend đổi sang mã ngành. */
  categories: string[]
}

export const nfc = (text: string): string => text.normalize("NFC")

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  bull: "•",
  middot: "·",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
}

const ACCENTS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
}

/** Giải thực thể HTML, gồm cả chữ có dấu kiểu `&iacute;` (dựng từ chữ cái + dấu kết hợp). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10))
    const named = NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()]
    if (named) return named
    const accented = entity.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml)$/)
    if (accented) return (accented[1]! + ACCENTS[accented[2]!]!).normalize("NFC")
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
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/**
 * URL tìm kiếm: `/tuyen-dung?q=<từ khoá>&page=N`, 30 tin mỗi trang (đo
 * 2026-10-13: "kế toán" 5.300+ tin; trang 1 và 2 không trùng tin nào).
 * robots.txt chỉ chặn `/ajax` và `/apply`.
 */
export function searchUrl(options: { query?: string; page?: number }): string | null {
  const query = options.query?.trim()
  if (!query) return null
  const params = new URLSearchParams({ q: query })
  if (options.page && options.page > 1) params.set("page", String(options.page))
  return `${BASE_URL}/tuyen-dung?${params.toString().replace(/%20/g, "+")}`
}

/** Mỗi thẻ tin mở bằng `<div class="relative flex items-start gap-3">`; cắt theo mốc đó. */
export function splitJobCards(html: string): string[] {
  const starts = [...html.matchAll(/<div class="relative flex items-start gap-3">/g)].map((match) => match.index!)
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? start + 4_500))
}

/** "__" (chưa công bố trên thẻ)/"Đang cập nhật"/"Thỏa thuận"/"Thương lượng" là không công bố lương. */
export const salaryOf = (text: string | null | undefined): string | null => {
  const value = text ? nfc(text).trim() : ""
  if (!value || value === "__" || /dang cap nhat|thoa thuan|thuong luong|canh tranh|negotiable/.test(fold(value))) {
    return null
  }
  return value
}

/** Mã hash cuối slug (`ke-toan-tong-hop-JDaj4kwX9G` -> `JDaj4kwX9G`). */
const hashOf = (slug: string): string | undefined => slug.match(/-([A-Za-z0-9]{6,})$/)?.[1]

/** URL logo tuyệt đối; ảnh giữ chỗ `no_company` coi như không có logo. */
const logoUrl = (src: string | undefined): string | null => {
  if (!src || src.includes("no_company")) return null
  return src.startsWith("http") ? src : BASE_URL + src
}

export function parseJobCard(card: string): JobCard | null {
  const link = card.match(
    /<a href="https:\/\/123job\.vn\/viec-lam\/([^"?]+)"[^>]*wire:navigate[^>]*>([\s\S]*?)<\/a>/,
  )
  if (!link) return null
  const slug = link[1]!
  const id = hashOf(slug)
  const title = clean(link[2]!)
  if (!id || !title) return null

  const company = card.match(/<img[^>]*\salt="([^"]*)"/)?.[1]
  const logo = card.match(/<img[^>]*\ssrc="([^"]*)"/)?.[1]
  const location = card.match(/d="M17\.657 16\.657[\s\S]*?<\/svg>\s*([^<]+?)\s*<\/span>/)?.[1]
  const posted = card.match(/Đăng:\s*([^<]+?)\s*<\/span>/)?.[1]

  return {
    id,
    slug,
    title,
    company: company ? clean(company) || null : null,
    companyUrl: null,
    companyLogo: logoUrl(logo),
    location: location ? clean(location) || null : null,
    workMode: null,
    salary: salaryOf(card.match(/text-orange-500">([^<]*)<\/span>/)?.[1]),
    postedAt: posted ? clean(posted) || null : null,
    tags: [],
    url: `${BASE_URL}/viec-lam/${slug}`,
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

/** Thân của mục `<h2>…</h2><div>…` trên trang chi tiết, tìm theo tiêu đề không dấu. */
function sectionBody(html: string, headingFold: string): { heading: string; body: string } | null {
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
  for (let i = 0; i < headings.length; i++) {
    const heading = clean(headings[i]![1]!)
    if (fold(heading).trim() !== headingFold) continue
    const start = headings[i]!.index! + headings[i]![0].length
    const end = headings[i + 1]?.index ?? html.length
    return { heading, body: html.slice(start, end) }
  }
  return null
}

/** Mô tả công việc (block prose dưới tiêu đề "Mô tả công việc"), GIỮ tiêu đề cho khung chấm điểm. */
export function parseJobDescription(html: string): string | null {
  const section = sectionBody(html, "mo ta cong viec")
  if (!section) return null
  const body = clean(section.body)
  return body.length > 20 ? `${section.heading}\n${body}` : null
}

/** Tên công ty từ mục "Thông tin công ty" (thuộc tính alt của logo). */
function detailCompany(html: string): string | null {
  const alt = sectionBody(html, "thong tin cong ty")?.body.match(/<img[^>]*\salt="([^"]*)"/)?.[1]
  return alt ? clean(alt) || null : null
}

/**
 * Trang chi tiết → tin. Mã tin là hash cuối slug; backend chỉ dùng `description`
 * (và `categories` nếu thẻ trống) từ đây, các trường còn lại lấy từ thẻ tìm kiếm.
 */
export function parseDetail(html: string, slug: string): JobDetail | null {
  const id = hashOf(slug)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ""
  const title = clean(h1.replace(/<span[\s\S]*?<\/span>/g, ""))
  if (!id || !title) return null

  return {
    id,
    slug,
    title,
    company: detailCompany(html),
    companyUrl: null,
    companyLogo: null,
    location: null,
    workMode: null,
    salary: null,
    postedAt: html.match(/Đăng:\s*([^<]+?)\s*<\/span>/)?.[1]?.trim() ?? null,
    tags: [],
    categories: [],
    url: `${BASE_URL}/viec-lam/${slug}`,
    description: parseJobDescription(html),
  }
}

/** "TP.HCM", "Hồ Chí Minh", "Sài Gòn" là MỘT nơi; hồ sơ gửi "Ho Chi Minh". */
const PLACE_ALIASES: Array<[RegExp, string]> = [
  [/\b(tp )?hcm\b|\btphcm\b|\bsai gon\b|\bthanh pho ho chi minh\b/g, "ho chi minh"],
]

const place = (text: string): string => {
  let folded = ` ${fold(text).replace(/[^a-z0-9]+/g, " ").trim()} `
  for (const [pattern, canonical] of PLACE_ALIASES) folded = folded.replace(pattern, canonical)
  return folded
}

const COUNTRY_WIDE = new Set(["vietnam", "viet nam", "vn"])

/** So khớp địa điểm không dấu, hiểu các cách viết TP.HCM; tên quốc gia nghĩa là "cả nước". */
export function matchesLocation(jobLocation: string | null, wanted: string): boolean {
  const target = place(wanted).trim()
  if (!target || COUNTRY_WIDE.has(target)) return true
  if (!jobLocation) return false
  return place(jobLocation).includes(` ${target} `)
}
