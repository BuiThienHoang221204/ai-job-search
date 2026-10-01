export const BASE_URL = "https://careerviet.vn"

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

/** Dấu hiệu thử thách chống bot. Một widget reCAPTCHA trong form góp ý KHÔNG phải trang chặn - đã sập bẫy đó ở joboko-search. */
const CHALLENGE = /hcaptcha\.com|g-recaptcha|challenges\.cloudflare\.com|<title>Just a moment/i

/** Có nội dung thật: thẻ tin hoặc JSON-LD của một tin. */
const HAS_CONTENT = /id="job-item-|"JobPosting"/

/** Trang chặn = có dấu hiệu thử thách VÀ không có nội dung thật. Trang chặn thường vẫn là HTTP 200 (xem careerlink-search). */
export const isBlockedPage = (html: string): boolean => CHALLENGE.test(html) && !HAS_CONTENT.test(html)

/** Tải HTML, lùi dần khi gặp 403/429/5xx. Trả "" khi 404. Ném BlockedError khi gặp trang chặn. `fetch` của bun nhận 200 như trình duyệt (đo 2026-09-30), không cần curl. */
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
        throw new BlockedError("CareerViet trả trang chặn thay vì dữ liệu; tạm dừng quét portal này")
      }
      return html
    }

    const retryable =
      response.status === 429 || response.status === 403 || response.status >= 500
    if (!retryable || attempt === maxRetries) {
      throw new Error(`CareerViet trả về ${response.status}`)
    }
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    delay *= 2
  }

  throw new Error("không thể tải trang")
}

export interface JobCard {
  /** Mã tin dạng hex ("35C83573"), ổn định, dùng làm externalId. */
  id: string
  /** Dạng "<ten-tin>.<id>" - đủ để dựng lại URL chi tiết. */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  companyLogo: string | null
  location: string | null
  /** CareerViet không ghi hình thức làm việc trên thẻ tìm kiếm. */
  workMode: string | null
  /** "Cạnh tranh"/"Thỏa thuận" được trả về null. */
  salary: string | null
  /** Thẻ tìm kiếm chỉ có mốc "Cập nhật" (dd-mm-yyyy), không có ngày đăng; `detail` trả `datePosted` thật. */
  postedAt: string | null
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

export const nfc = (text: string): string => text.normalize("NFC")

const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()

/** Bỏ dấu, chữ thường, mọi thứ không phải chữ số thành "-" - đúng cách CareerViet dựng slug từ khoá. */
export const slugify = (text: string): string =>
  fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

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

/**
 * URL tìm kiếm theo từ khoá: `/viec-lam/<slug>-k-vi.html`, trang N là
 * `/viec-lam/<slug>-k-trang-N-vi.html` (đo 2026-09-30: trang 2 có 50 tin, trùng
 * 1 tin với trang 1). robots.txt không chặn `/viec-lam/`.
 */
export function searchUrl(options: { query?: string; page?: number }): string | null {
  const slug = options.query ? slugify(options.query) : ""
  if (!slug) return null
  const page = options.page && options.page > 1 ? `-trang-${options.page}` : ""
  return `${BASE_URL}/viec-lam/${slug}-k${page}-vi.html`
}

/** Cắt trang thành từng thẻ tin theo mốc `id="job-item-<id>"`. */
export function splitJobCards(html: string): string[] {
  const marker = 'id="job-item-'
  const cards: string[] = []
  let index = html.indexOf(marker)
  while (index !== -1) {
    const next = html.indexOf(marker, index + marker.length)
    cards.push(next === -1 ? html.slice(index) : html.slice(index, next))
    index = next
  }
  return cards
}

const attr = (fragment: string | undefined, name: string): string | null => {
  if (!fragment) return null
  const value = fragment.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
  return value ? nfc(decodeEntities(value)).trim() || null : null
}

/** Lương không phải con số ("Cạnh tranh", "Thỏa thuận") trả null như các portal khác. */
export const salaryOf = (text: string | null): string | null => {
  if (!text) return null
  const value = text.replace(/^Lương\s*:\s*/i, "").trim()
  return value && !/cạnh tranh|thỏa thuận|thoả thuận|thương lượng/i.test(value) ? value : null
}

/** "13-09-2026" -> ISO. Sai dạng thì null chứ không đoán. */
const dmyToIso = (text: string | undefined): string | null => {
  const match = text?.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  return match ? new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00+07:00`).toISOString() : null
}

/** Logo nằm trong URL tối ưu ảnh của Next.js (`/_next/image?url=<ảnh gốc>`); lấy ảnh gốc. */
const logoOf = (src: string | null): string | null => {
  if (!src) return null
  try {
    const original = new URL(src, BASE_URL).searchParams.get("url")
    return original ? decodeURIComponent(original) : new URL(src, BASE_URL).toString()
  } catch {
    return null
  }
}

export function parseJobCard(card: string): JobCard | null {
  const link = card.match(/<h2><a class="job_link"[^>]*>/)?.[0]
  const id = attr(link, "data-id")
  const href = attr(link, "href")
  const slug = href?.match(/\/tim-viec-lam\/([^/?#]+?)\.html/)?.[1]
  const title = attr(link, "title")
  if (!id || !slug || !title) return null

  const companyLink = card.match(/<a class="company-name"[^>]*>/)?.[0]
  const companyHref = attr(companyLink, "href")

  const locations = [
    ...(card.match(/<div class="location">[\s\S]*?<\/ul>/)?.[0] ?? "").matchAll(/<li>([^<]+)<\/li>/g),
  ].map((m) => nfc(decodeEntities(m[1]!)).trim())

  const salaryText = card.match(/<div class="salary"><p>([\s\S]*?)<\/p>/)?.[1]
  const updated = card.match(/Cập nhật[\s\S]{0,80}?<time>([^<]+)<\/time>/)?.[1]

  return {
    id,
    slug,
    title,
    company: attr(companyLink, "title"),
    companyUrl: companyHref ? new URL(companyHref, BASE_URL).toString() : null,
    companyLogo: logoOf(attr(card.match(/<img[^>]*class="image-logo-emp"[^>]*>/)?.[0], "src")),
    location: locations.length ? locations.join(", ") : null,
    workMode: null,
    salary: salaryOf(salaryText ? clean(salaryText) : null),
    postedAt: dmyToIso(updated),
    tags: [],
    url: `${BASE_URL}/vi/tim-viec-lam/${slug}.html`,
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
  hiringOrganization?: { name?: string; url?: string; logo?: string }
  jobLocation?: unknown
  baseSalary?: {
    currency?: string
    value?: { minValue?: number; maxValue?: number; value?: number }
  }
  industry?: string
  skills?: string
  identifier?: { value?: string }
}

/** Đọc khối JSON-LD `JobPosting` của CHÍNH tin - trang còn có "Các công việc tương tự" nhưng chúng không mang JSON-LD. */
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

/** Các khối được ghép thành mô tả; "Phúc lợi", "Địa điểm", "Thông tin khác" không giúp rút kỹ năng. */
const DESCRIPTION_SECTIONS = ["mo ta cong viec", "yeu cau cong viec"]

/** Ghép "Mô tả Công việc" + "Yêu Cầu Công Việc", GIỮ tiêu đề để khung chấm điểm tách được hai phần. JSON-LD chỉ là đường lùi. */
export function parseJobDescription(html: string): string | null {
  const blocks = [
    ...html.matchAll(/<h2 class="detail-title">([^<]+)<\/h2><div>([\s\S]*?)<\/div><\/div>/g),
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

const formatMillions = (amount: number): string =>
  `${Math.round((amount / 1_000_000) * 10) / 10} triệu`

/** Lương từ `baseSalary` của JSON-LD. Chỉ có một con số thì đó là mức SÀN ("Trên 16 Triệu" trên thẻ). */
export function salaryFromPosting(posting: JobPosting | null): string | null {
  const value = posting?.baseSalary?.value
  if (!value || posting?.baseSalary?.currency !== "VND") return null
  const min = value.minValue ?? value.value
  const max = value.maxValue
  if (min && max && max !== min) return `${formatMillions(min)} - ${formatMillions(max)}`
  if (min) return `Từ ${formatMillions(min)}`
  if (max) return `Đến ${formatMillions(max)}`
  return null
}

/** Tỉnh từ `jobLocation` - lúc là object, lúc là mảng. CareerViet đặt NGƯỢC chuẩn: `addressRegion` là QUẬN, `addressLocality` mới là tỉnh. */
export function locationFromPosting(posting: JobPosting | null): string | null {
  const places = [posting?.jobLocation].flat() as Array<{
    address?: { addressRegion?: string; addressLocality?: string }
  } | undefined>
  const regions = places
    .map((place) => place?.address?.addressLocality ?? place?.address?.addressRegion)
    .filter((region): region is string => Boolean(region))
    .map((region) => nfc(region).trim())
  return regions.length ? [...new Set(regions)].join(", ") : null
}

/** Kỹ năng CareerViet tự gắn cho tin ("Kế toán tổng hợp, general accountant, ..."), bỏ trùng không phân biệt dấu. */
export function skillsFromPosting(posting: JobPosting | null): string[] {
  const seen = new Set<string>()
  return (posting?.skills ?? "")
    .split(",")
    .map((skill) => nfc(skill).trim())
    .filter((skill) => {
      const key = fold(skill)
      if (!skill || seen.has(key)) return false
      seen.add(key)
      return true
    })
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
