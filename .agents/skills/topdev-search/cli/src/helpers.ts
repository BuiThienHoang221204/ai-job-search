export const BASE_URL = "https://topdev.vn"

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

/** Portal chặn. Backend nhận mã BLOCKED và tạm ngừng gọi portal này - KHÔNG tìm cách vượt Cloudflare. */
export class BlockedError extends Error {}

/** Dấu hiệu trang thử thách của Cloudflare (TopDev đứng sau Cloudflare). */
const CHALLENGE = /<title>Just a moment|challenges\.cloudflare\.com|cf-chl|cf_chl_opt/i

/** Có nội dung thật: payload kết quả tìm kiếm hoặc JSON-LD của một tin. */
const HAS_CONTENT = /self\.__next_f\.push|"JobPosting"/

/** Trang chặn = có dấu hiệu thử thách VÀ không có nội dung thật; Cloudflare có lúc trả trang thử thách với mã 200. */
export const isBlockedPage = (html: string): boolean => CHALLENGE.test(html) && !HAS_CONTENT.test(html)

/** 403 là BLOCKED NGAY, không thử lại - cùng bài học của topcv-search và vieclam24h-search. */
export function errorForStatus(status: number): Error {
  return status === 403
    ? new BlockedError("TopDev chặn (403); tạm dừng quét portal này")
    : new Error(`TopDev trả về ${status}`)
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
        throw new BlockedError("TopDev trả trang thử thách thay vì dữ liệu; tạm dừng quét portal này")
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
  /** Mã số của tin, ổn định, dùng làm externalId. */
  id: string
  /** Dạng "<ten-tin>-<id>" - đúng đường dẫn `/viec-lam/<slug>`. */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  companyLogo: string | null
  location: string | null
  /** "remote" khi tin ghi địa điểm Remote; còn lại không rõ. */
  workMode: string | null
  /** "Thương lượng"/"Negotiable" được trả về null. */
  salary: string | null
  /** Ngày ĐĂNG (dd-mm-yyyy), không phải mốc làm mới. */
  postedAt: string | null
  /** Kỹ năng TopDev gắn cho tin. */
  tags: string[]
  /** Nhãn ngành suy từ `job_category_id` (xem `CATEGORY_LABELS`); rỗng khi mã quá rộng hoặc không có. */
  categories: string[]
  url: string
  /** Mô tả ghép từ payload; null khi không giải được tham chiếu - backend sẽ gọi `detail`. */
  description: string | null
}

/** `industry` trong JSON-LD là "Information Technology" cho MỌI tin, kể cả tin kế toán (đo 2026-10-13) — KHÔNG dùng; nhãn lấy từ `job_category_id`. */
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
  laquo: "«",
  raquo: "»",
  times: "×",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
}

const ACCENTS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
  ring: "̊",
  cedil: "̧",
}

/**
 * Giải thực thể HTML. Mô tả trong JSON-LD của TopDev mã hoá chữ có dấu thành
 * `&iacute;`, `&acirc;`... - chỉ giải vài thực thể cơ bản thì "Vị trí" thành
 * "Vị tr&iacute;". Chữ Latin có dấu được dựng từ chữ cái + dấu kết hợp.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10))
    const named = NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()]
    if (named) return named
    const accented = entity.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|ring|cedil)$/)
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
 * URL tìm kiếm: `/jobs/search?keyword=<từ khoá>&page=N`, 15 tin mỗi trang (đo
 * 2026-10-13: "Kế toán" 137 tin / 10 trang, trang 2 là tin 16-30). robots.txt
 * không chặn `/jobs/search` (chỉ chặn `/employers/search`, `/partners/`...).
 */
export function searchUrl(options: { query?: string; page?: number }): string | null {
  const query = options.query?.trim()
  if (!query) return null
  const params = new URLSearchParams({ keyword: query })
  if (options.page && options.page > 1) params.set("page", String(options.page))
  return `${BASE_URL}/jobs/search?${params.toString().replace(/%20/g, "+")}`
}

/**
 * Ghép payload RSC `self.__next_f.push([1,"..."])`. Thẻ script mang `type` lạ do
 * Cloudflare Rocket Loader chèn vào, nên KHÔNG khớp cứng `<script>`.
 */
export function flightBuffer(html: string): string {
  let buffer = ""
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      buffer += JSON.parse(match[1]!) as string
    } catch {
      buffer += ""
    }
  }
  return buffer
}

/** Đoạn văn rời `<id>:T<độ dài hex>,<nội dung>` - độ dài tính bằng BYTE, không phải ký tự (bài học của vietnamworks-search). */
export function flightTextChunks(buffer: string): Map<string, string> {
  const bytes = Buffer.from(buffer, "utf8")
  const marker = /([0-9a-f]+):T([0-9a-f]+),/g
  const chunks = new Map<string, string>()
  let cursor = 0

  while (cursor < buffer.length) {
    marker.lastIndex = cursor
    const match = marker.exec(buffer)
    if (!match) break

    const from = match.index + match[0].length
    const fromByte = Buffer.byteLength(buffer.slice(0, from), "utf8")
    const text = bytes.subarray(fromByte, fromByte + parseInt(match[2]!, 16)).toString("utf8")

    if (text) chunks.set(match[1]!, text)
    cursor = from + text.length
  }
  return chunks
}

function balancedEnd(buffer: string, start: number): number {
  const open = buffer[start]
  const close = open === "[" ? "]" : "}"
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < buffer.length; index++) {
    const char = buffer[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === open) depth++
    else if (char === close && --depth === 0) return index
  }
  return -1
}

export interface ApiJob {
  id?: number
  title?: string
  slug?: string
  company?: { display_name?: string; detail_url?: string; image_logo?: string }
  addresses?: { sort_addresses?: string; address_region_list?: string }
  salary?: { value?: string; is_negotiable?: string }
  published?: { date?: string }
  skills_arr?: string[]
  responsibilities_original?: string
  requirements_original?: string
  job_category_id?: number | null
}

/**
 * `job_category_id` → nhãn. TopDev không công bố bảng tên; bảng này dựng từ 18
 * từ khoá đa ngành đo 2026-10-13. CHỈ giữ mã rõ nghĩa: mã 14 gồm cả kế toán,
 * marketing, chăm sóc khách hàng lẫn ngân hàng, mã 33 gồm cơ khí, xuất nhập
 * khẩu lẫn xây dựng — gán chúng vào một ngành là xếp sai các ngành còn lại, nên
 * để tiêu đề quyết định.
 */
const CATEGORY_LABELS: Record<number, string> = {
  1: "Công nghệ thông tin",
  27: "Hành chính - Nhân sự",
  50: "Giáo dục - Đào tạo",
  61: "Thiết kế",
}

export const categoriesOf = (job: ApiJob): string[] => {
  const label = job.job_category_id != null ? CATEGORY_LABELS[job.job_category_id] : undefined
  return label ? [label] : []
}

/**
 * Đúng mảng KẾT QUẢ tìm kiếm - mảng nằm ngay trước `"meta":{"total":...}`.
 * Trang còn nhúng tin của các khối "việc làm hot" (25 đối tượng tin trên một
 * trang 15 kết quả), nên lấy mọi đối tượng có `id` + `title` là lấy nhầm.
 */
export function resultJobs(buffer: string): ApiJob[] {
  const meta = buffer.indexOf(',"meta":{"total":')
  if (meta < 0) return []
  for (const match of buffer.matchAll(/\[\{"id":\d+,"title":/g)) {
    if (match.index! > meta) break
    if (balancedEnd(buffer, match.index!) !== meta - 1) continue
    try {
      return JSON.parse(buffer.slice(match.index!, meta)) as ApiJob[]
    } catch {
      return []
    }
  }
  return []
}

/** Đối tượng tin có `id` cho trước trong payload trang chi tiết; null nếu không có. */
export function jobObject(buffer: string, id: string): ApiJob | null {
  for (const match of buffer.matchAll(new RegExp(`\\{"id":${id},"title":`, "g"))) {
    const end = balancedEnd(buffer, match.index!)
    if (end < 0) continue
    try {
      const job = JSON.parse(buffer.slice(match.index!, end + 1)) as ApiJob
      if (job.responsibilities_original || job.requirements_original) return job
    } catch {
      continue
    }
  }
  return null
}

/** Tổng số kết quả theo `meta.total`; 0 khi không đọc được. */
export function resultTotal(buffer: string): number {
  return Number(buffer.match(/"meta":\{"total":(\d+)/)?.[1] ?? 0)
}

const isRef = (value: unknown): value is string =>
  typeof value === "string" && /^\$[0-9a-f]+$/.test(value)

/** Ghép "Mô tả công việc" + "Yêu cầu", GIỮ tiêu đề như các portal khác; null nếu thiếu một nửa để backend lấy bản đầy đủ từ `detail`. */
export function describeJob(job: ApiJob, chunks: Map<string, string>): string | null {
  const resolve = (value: string | undefined): string | null => {
    if (!value) return null
    if (isRef(value)) return chunks.get(value.slice(1)) ?? null
    return value
  }
  const responsibilities = resolve(job.responsibilities_original)
  const requirements = resolve(job.requirements_original)
  if (!responsibilities || !requirements) return null

  const parts = [
    `Mô tả công việc\n${clean(responsibilities)}`,
    `Yêu cầu ứng viên\n${clean(requirements)}`,
  ]
  return parts.join("\n\n")
}

/** "Thương lượng"/"Negotiable" là không công bố lương. */
export const salaryOf = (text: string | null | undefined): string | null => {
  const value = text ? nfc(text).trim() : ""
  if (!value || /thuong luong|negotiable|thoa thuan/.test(fold(value))) return null
  return value
}

export function toJobCard(job: ApiJob, chunks: Map<string, string> = new Map()): JobCard | null {
  const title = job.title ? nfc(decodeEntities(job.title)).trim() : ""
  if (!job.id || !title || !job.slug) return null

  const slug = `${job.slug}-${job.id}`
  const location =
    nfc(job.addresses?.sort_addresses ?? "").trim() ||
    nfc(job.addresses?.address_region_list ?? "").trim() ||
    null

  return {
    id: String(job.id),
    slug,
    title,
    company: job.company?.display_name ? nfc(job.company.display_name).trim() : null,
    companyUrl: job.company?.detail_url || null,
    companyLogo: job.company?.image_logo || null,
    location,
    workMode: location && /\bremote\b/i.test(location) ? "remote" : null,
    salary: salaryOf(job.salary?.value),
    postedAt: job.published?.date ?? null,
    tags: (job.skills_arr ?? []).map((skill) => nfc(skill).trim()).filter(Boolean),
    categories: categoriesOf(job),
    url: `${BASE_URL}/viec-lam/${slug}`,
    description: describeJob(job, chunks),
  }
}

export function parseSearchPage(html: string): JobCard[] {
  const buffer = flightBuffer(html)
  const chunks = flightTextChunks(buffer)
  return resultJobs(buffer)
    .map((job) => toJobCard(job, chunks))
    .filter((job): job is JobCard => job !== null)
}

export type JobPosting = {
  title?: string
  description?: string
  datePosted?: string
  skills?: string
  industry?: string
  hiringOrganization?: { name?: string; sameAs?: string; logo?: string }
  jobLocation?: unknown
  baseSalary?: { currency?: string; value?: { value?: unknown; minValue?: number; maxValue?: number } }
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

const formatMillions = (amount: number): string =>
  `${Math.round((amount / 1_000_000) * 10) / 10} triệu`

/** Lương từ `baseSalary`; `value: "Negotiable"` là không công bố. */
export function salaryFromPosting(posting: JobPosting | null): string | null {
  const value = posting?.baseSalary?.value
  if (!value) return null
  const min = typeof value.minValue === "number" ? value.minValue : undefined
  const max = typeof value.maxValue === "number" ? value.maxValue : undefined
  if (min && max && max !== min) return `${formatMillions(min)} - ${formatMillions(max)}`
  if (min) return `Từ ${formatMillions(min)}`
  if (max) return `Đến ${formatMillions(max)}`
  return typeof value.value === "string" ? salaryOf(value.value) : null
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

export function skillsFromPosting(posting: JobPosting | null): string[] {
  return (posting?.skills ?? "")
    .split(",")
    .map((skill) => nfc(skill).trim())
    .filter(Boolean)
}

/** "2026-10-05" → "05-10-2026", cùng định dạng ngày đăng của trang tìm kiếm. */
export const postedDate = (iso: string | undefined): string | null => {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

/** Trang chi tiết → tin. Mô tả lấy từ payload RSC: JSON-LD có tiêu đề các mục nhưng THIẾU nội dung (đo 2026-10-13), nên nó chỉ là đường lùi. */
export function parseDetail(html: string, slug: string): JobDetail | null {
  const id = slug.match(/-(\d{4,})$/)?.[1]
  const posting = parseJobPosting(html)
  const title = posting?.title ? nfc(decodeEntities(posting.title)).trim() : ""
  if (!id || !title) return null

  const buffer = flightBuffer(html)
  const job = jobObject(buffer, id)
  const description =
    (job ? describeJob(job, flightTextChunks(buffer)) : null) ??
    (posting?.description ? clean(posting.description) || null : null)

  const organization = posting?.hiringOrganization
  const location = locationFromPosting(posting)

  return {
    id,
    slug,
    title,
    company: organization?.name ? nfc(organization.name).trim() || null : null,
    companyUrl: organization?.sameAs ?? null,
    companyLogo: organization?.logo ?? null,
    location,
    workMode: location && /\bremote\b/i.test(location) ? "remote" : null,
    salary: salaryFromPosting(posting),
    postedAt: postedDate(posting?.datePosted),
    tags: skillsFromPosting(posting),
    categories: job ? categoriesOf(job) : [],
    url: `${BASE_URL}/viec-lam/${slug}`,
    description,
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
