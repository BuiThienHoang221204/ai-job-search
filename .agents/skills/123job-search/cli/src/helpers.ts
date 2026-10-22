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

/** Có nội dung thật: thẻ tin hoặc JSON-LD của một tin. */
const HAS_CONTENT = /js-item-job|"JobPosting"/

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
  /** `data-id` số của thẻ, ổn định, dùng làm externalId. */
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
  /** `data-time` của thẻ (yyyy-mm-dd) - chính là mốc "Đăng N giờ trước". */
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

/** Mỗi thẻ tin bắt đầu bằng `<div class="job__list-item js-item-job ...`; cắt theo mốc đó. */
export function splitJobCards(html: string): string[] {
  const starts = [...html.matchAll(/<div class="job__list-item js-item-job[^"]*"/g)].map((match) => match.index!)
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? start + 6_000))
}

/** "Đang cập nhật"/"Thỏa thuận"/"Thương lượng" là không công bố lương. */
export const salaryOf = (text: string | null | undefined): string | null => {
  const value = text ? nfc(text).trim() : ""
  if (!value || /dang cap nhat|thoa thuan|thuong luong|canh tranh|negotiable/.test(fold(value))) return null
  return value
}

const labelText = (card: string, className: string): string | null => {
  const raw = card.match(new RegExp(`<div class="${className}"[^>]*>\\s*<label>([\\s\\S]*?)</label>`))?.[1]
  const text = raw ? clean(raw) : ""
  return text || null
}

export function parseJobCard(card: string): JobCard | null {
  const id = card.match(/data-id="(\d+)"/)?.[1]
  const link = card.match(/<h2 class="job__list-item-title"><a href="https:\/\/123job\.vn\/viec-lam\/([^"?]+)[^"]*" title="([^"]*)"/)
  if (!id || !link) return null

  const slug = link[1]!
  const title = nfc(decodeEntities(link[2]!)).trim()
  if (!title) return null

  const company = card.match(/<div class="job__list-item-company[^"]*"><span>([\s\S]*?)<\/span>/)?.[1]
  const logo = card.match(/<div class="job__list-item-thumb"><img[^>]*data-src="([^"]*)"/)?.[1]
  const time = card.match(/data-time="(\d{4}-\d{2}-\d{2})/)?.[1]

  return {
    id,
    slug,
    title,
    company: company ? clean(company) || null : null,
    companyUrl: null,
    companyLogo: logo || null,
    location: labelText(card, "address"),
    workMode: null,
    salary: salaryOf(labelText(card, "salary")),
    postedAt: time ?? null,
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

export type JobPosting = {
  title?: string
  description?: string
  datePosted?: string
  industry?: string
  hiringOrganization?: { name?: string; sameAs?: string; logo?: string }
  jobLocation?: unknown
  identifier?: { value?: unknown }
}

/** HTML của 123job được nén nên có lúc bỏ ngoặc thuộc tính: `<script type=application/ld+json>`. */
export function parseJobPosting(html: string): JobPosting | null {
  for (const [, body] of html.matchAll(
    /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/g,
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

/** Các mục được ghép thành mô tả; "Quyền lợi" không giúp rút kỹ năng. */
const DESCRIPTION_SECTIONS = ["mo ta cong viec", "yeu cau cong viec"]

/**
 * Ghép "Mô tả công việc" + "Yêu cầu công việc" từ HTML, GIỮ tiêu đề để khung
 * chấm điểm tách được hai phần. JSON-LD chỉ là đường lùi: nó có lúc THIẾU hẳn
 * phần yêu cầu (đo 2026-10-13, tin "Kế toán thuế").
 */
export function parseJobDescription(html: string): string | null {
  const blocks = [
    ...html.matchAll(
      /<h2 class="content-group__title">([^<]+)<\/h2><div class="content-group__content">([\s\S]*?)<\/div><\/div>/g,
    ),
  ]
    .filter(([, heading]) => DESCRIPTION_SECTIONS.includes(fold(heading!).trim()))
    .map(([, heading, body]) => {
      const text = clean(body!)
      return text.length > 20 ? `${nfc(heading!).trim()}\n${text}` : ""
    })
    .filter(Boolean)
  if (blocks.length) return blocks.join("\n\n")

  const fallback = parseJobPosting(html)?.description
  return fallback ? clean(fallback) || null : null
}

/** Nhãn ngành nghề từ JSON-LD `industry`; có thể nối nhiều nhãn bằng dấu phẩy. */
export function categoriesFromPosting(posting: JobPosting | null): string[] {
  return posting?.industry
    ? nfc(posting.industry).split(/,(?![^(]*\))/).map((label) => label.trim()).filter(Boolean)
    : []
}

/** Tỉnh từ `jobLocation` - lúc là object, lúc là mảng. */
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

/** Trang chi tiết → tin. Mã tin lấy từ `data-id` của chính tin trên trang (nút lưu tin), không phải mã công ty trong JSON-LD. */
export function parseDetail(html: string, slug: string): JobDetail | null {
  const posting = parseJobPosting(html)
  const title = posting?.title ? nfc(decodeEntities(posting.title)).trim() : ""
  const hash = slug.match(/-([A-Za-z0-9]{10})$/)?.[1]
  const id =
    (hash ? html.match(new RegExp(`data-id="(\\d+)"[^>]*data-hash-slug="${hash}"`))?.[1] : undefined) ??
    html.match(/data-job-id="(\d+)"/)?.[1] ??
    hash
  if (!title || !id) return null

  const organization = posting?.hiringOrganization
  return {
    id,
    slug,
    title,
    company: organization?.name ? nfc(organization.name).trim() || null : null,
    companyUrl: organization?.sameAs ?? null,
    companyLogo: organization?.logo ?? null,
    location: locationFromPosting(posting),
    workMode: null,
    salary: null,
    postedAt: posting?.datePosted?.slice(0, 10) ?? null,
    tags: [],
    categories: categoriesFromPosting(posting),
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
