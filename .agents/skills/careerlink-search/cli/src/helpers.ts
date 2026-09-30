export const BASE_URL = "https://www.careerlink.vn"

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

/**
 * Trang hCaptcha của CareerLink trả HTTP **200**, nên không kiểm nội dung thì
 * nó thành "0 kết quả" - lượt quét báo xong mà không có gì. Đo 2026-09-29: bật
 * sau khoảng 5 trang tìm kiếm + 28 trang chi tiết ở nhịp 3 giây.
 */
export const isBlockedPage = (html: string): boolean =>
  /id="recaptcha_confirm_form"|js\.hcaptcha\.com/.test(html)

/**
 * Tải HTML, lùi dần khi gặp 403/429/5xx. Trả "" khi 404. Ném BlockedError khi gặp captcha.
 *
 * Khác TopCV: CareerLink không đứng sau lớp chặn vân tay TLS, `fetch` của bun
 * nhận 200 như curl (đo 2026-09-29), nên CLI này không cần curl.
 */
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
        throw new BlockedError("CareerLink trả trang captcha (chống bot); tạm dừng quét portal này")
      }
      return html
    }

    const retryable =
      response.status === 429 || response.status === 403 || response.status >= 500
    if (!retryable || attempt === maxRetries) {
      throw new Error(`CareerLink trả về ${response.status}`)
    }
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    delay *= 2
  }

  throw new Error("không thể tải trang")
}

export interface JobCard {
  /** data-job-id: số nguyên ổn định, dùng làm externalId. */
  id: string
  /** Dạng "<slug>/<id>" - đủ để dựng lại URL chi tiết. */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  companyLogo: string | null
  location: string | null
  /** CareerLink không ghi hình thức làm việc trên thẻ tìm kiếm. */
  workMode: string | null
  /** "Thương lượng" được trả về null. */
  salary: string | null
  /**
   * Thẻ tìm kiếm chỉ có mốc CẬP NHẬT (`data-datetime`), không có ngày đăng.
   * Mốc này luôn >= ngày đăng, nên tin được làm mới trông "mới" hơn thật;
   * ngày đăng thật (`datePosted`) chỉ có ở trang chi tiết.
   */
  postedAt: string | null
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

export const stripDiacritics = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")

const slugify = (text: string): string =>
  stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const stripTags = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")

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

/** CareerLink trả tên công ty ở dạng NFD (dấu tách rời) còn chức danh ở NFC - nhìn giống hệt mà so chuỗi thì khác, làm hỏng chống trùng giữa các portal. */
export const nfc = (text: string): string => text.normalize("NFC")

const clean = (html: string): string =>
  nfc(decodeEntities(stripTags(html)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/**
 * Dựng URL tìm kiếm. Tham số `keyword` là đường robots.txt cho phép và chính
 * là `urlTemplate` của SearchAction mà trang tự khai trong JSON-LD.
 *
 * CareerLink khớp NGUYÊN CỤM: "frontend developer" ra 0 tin trong khi
 * "frontend" ra 24 (đo 2026-09-29). Đó là hành vi của portal, không phải lỗi.
 */
export function searchUrl(options: { query?: string; page?: number }): string {
  const params = new URLSearchParams()
  if (options.query) params.set("keyword", options.query.trim())
  if (options.page && options.page > 1) params.set("page", String(options.page))
  return `${BASE_URL}/vieclam/tim-kiem-viec-lam?${params.toString()}`
}

/** Cắt trang thành từng thẻ tin theo mốc mở `<li class='list-group-item job-item`. */
export function splitJobCards(html: string): string[] {
  const marker = "<li class='list-group-item job-item"
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
  const value = fragment.match(new RegExp(`\\b${name}=["']([^"']*)["']`))?.[1]
  return value ? nfc(decodeEntities(value)).trim() || null : null
}

/** Lương "Thương lượng"/"Cạnh tranh" không phải con số, trả null như các portal khác. */
const salaryOf = (text: string | null): string | null =>
  text && !/thương lượng|cạnh tranh|thoả thuận|thỏa thuận/i.test(text) ? text : null

export function parseJobCard(card: string): JobCard | null {
  const link = card.match(/<a class="job-link[^"]*"[^>]*>/)?.[0]
  const href = attr(link, "href")
  const path = href?.match(/\/tim-viec-lam\/([^?#]+\/(\d+))/)
  if (!link || !path) return null

  const slug = path[1]!
  const id = path[2]!
  const title = attr(link, "title")
  if (!title) return null

  const companyLink = card.match(/<a class="text-dark job-company[^"]*"[^>]*>/)?.[0]
  const companyHref = attr(companyLink, "href")

  const locationBlock = card.match(/class='job-location[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? ""
  const locations = [...locationBlock.matchAll(/<a title="([^"]+)"/g)].map((m) =>
    nfc(decodeEntities(m[1]!)).trim(),
  )

  // Khối lương lồng một <span> chỉ chứa icon; bỏ nó đi rồi lấy chữ tới thẻ đóng kế tiếp.
  const salaryBlock = card
    .match(/class='job-salary[^']*'>([\s\S]{0,600})/)?.[1]
    ?.replace(/<span class='font-weight-bolder[\s\S]*?<\/span>/, "")
    .split("</span>")[0]
  const epoch = card.match(/data-datetime='(\d+)'/)?.[1]

  return {
    id,
    slug,
    title,
    company: attr(companyLink, "title"),
    companyUrl: companyHref ? new URL(companyHref, BASE_URL).toString() : null,
    companyLogo: attr(card.match(/<div class='job-logo[\s\S]*?<img[^>]*>/)?.[0], "src"),
    location: locations.length ? locations.join(", ") : null,
    workMode: null,
    salary: salaryOf(salaryBlock ? clean(salaryBlock) : null),
    postedAt: epoch ? new Date(Number(epoch) * 1000).toISOString() : null,
    tags: [],
    url: `${BASE_URL}/tim-viec-lam/${slug}`,
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
  hiringOrganization?: { name?: string; sameAs?: string; logo?: string }
  jobLocation?: Array<{ address?: { addressLocality?: string; addressRegion?: string } }>
  baseSalary?: {
    currency?: string
    value?: { minValue?: number; maxValue?: number; value?: number }
  }
  industry?: string
}

/** Đọc khối JSON-LD `JobPosting` - dữ liệu trang CỐ Ý công bố cho máy đọc, bền hơn bóc theo class. */
export function parseJobPosting(html: string): JobPosting | null {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g,
  )
  for (const [, body] of scripts) {
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

/**
 * Bóc mô tả từ trang chi tiết: "Mô tả công việc" + "Kinh nghiệm / Kỹ năng chi tiết".
 *
 * `description` của JSON-LD cũng chứa cả hai phần, nhưng dính liền thành một
 * khối và mất tiêu đề. Bóc từ HTML thì giữ được tiêu đề từng phần - khung chấm
 * điểm phân biệt mô tả với yêu cầu. JSON-LD chỉ là đường lùi.
 */
export function parseJobDescription(html: string): string | null {
  const blocks = ["section-job-description", "section-job-skills"]
    .map((id) => {
      const section = html.match(
        new RegExp(`id='${id}'[\\s\\S]*?<h5 class='job-section-title[^']*'>([\\s\\S]*?)</h5>[\\s\\S]*?rich-text-content'>([\\s\\S]*?)</div>`),
      )
      if (!section) return ""
      const text = clean(section[2]!)
      return text.length > 20 ? `${clean(section[1]!)}\n${text}` : ""
    })
    .filter(Boolean)

  if (blocks.length) return blocks.join("\n\n")

  const fallback = parseJobPosting(html)?.description
  return fallback ? clean(fallback) || null : null
}

const formatMillions = (amount: number): string =>
  `${Math.round((amount / 1_000_000) * 10) / 10} triệu`

/** Lương từ `baseSalary` của JSON-LD, cùng dạng chữ với thẻ tìm kiếm ("11 triệu - 15 triệu"). */
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

export function locationFromPosting(posting: JobPosting | null): string | null {
  const regions = (posting?.jobLocation ?? [])
    .map((place) => place.address?.addressRegion ?? place.address?.addressLocality)
    .filter((region): region is string => Boolean(region))
  return regions.length ? [...new Set(regions.map(nfc))].join(", ") : null
}

const COUNTRY_WIDE = new Set(["vietnam", "viet-nam", "vn"])

/** So khớp địa điểm không dấu; tên quốc gia nghĩa là "cả nước" - xem ghi chú cùng tên ở topcv-search. */
export function matchesLocation(jobLocation: string | null, wanted: string): boolean {
  const target = slugify(wanted)
  if (!target || COUNTRY_WIDE.has(target)) return true
  if (!jobLocation) return false
  return slugify(jobLocation).includes(target)
}
