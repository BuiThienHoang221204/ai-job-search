const BASE_URL = "https://timviec.ai"
const API_URL = `${BASE_URL}/api/candidates`
export const PAGE_SIZE = 20
export const MAX_PAGES = 10
export const PAGE_GAP_MS = 1_000

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "vi,en;q=0.9",
}

/** Portal chặn. Backend nhận mã BLOCKED và tạm ngừng gọi portal này - KHÔNG tìm cách vượt. */
export class BlockedError extends Error {}

const CHALLENGE = /<title>Just a moment|challenges\.cloudflare\.com|cf-chl|g-recaptcha|hcaptcha/i

/** Có nội dung thật: JSON của API hoặc JSON-LD của trang tin. */
const HAS_CONTENT = /"success"\s*:\s*true|"JobPosting"/

/** Bị chặn = có dấu hiệu thử thách VÀ không có nội dung thật (ADR 0005). */
export const isBlockedPage = (body: string): boolean => CHALLENGE.test(body) && !HAS_CONTENT.test(body)

export function errorForStatus(status: number): Error {
  return status === 403
    ? new BlockedError("timviec.ai chặn (403); tạm dừng quét portal này")
    : new Error(`timviec.ai trả về ${status}`)
}

export interface ApiJob {
  id: string
  title: string
  company_name?: string | null
  company_logo_url?: string | null
  job_address_display?: string | null
  job_full_address?: string | null
  salary?: string | null
  job_description?: string | null
  job_requirement?: string | null
  job_benefit?: string | null
  /** Mili-giây dạng CHUỖI ("1786419673000"), không phải số. */
  published_at?: string | number | null
  /** Lần đăng hoặc làm mới gần nhất, cùng định dạng. */
  last_published_at?: string | number | null
}

interface ApiResponse<T> {
  success: boolean
  msg?: string
  data: T
  total?: number
}

/** Gọi API JSON, lùi dần khi 429/5xx. Trả null khi 404. Ném BlockedError khi 403 hoặc trang thử thách. */
export async function apiFetch<T>(path: string, params: Record<string, string> = {}): Promise<ApiResponse<T> | null> {
  const query = new URLSearchParams(params).toString()
  const url = `${API_URL}${path}${query ? `?${query}` : ""}`
  const maxRetries = 3
  let delay = 1_000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) })

    if (response.status === 404) return null
    if (response.ok) {
      const body = await response.text()
      if (isBlockedPage(body)) {
        throw new BlockedError("timviec.ai trả trang thử thách thay vì dữ liệu; tạm dừng quét portal này")
      }
      const parsed = JSON.parse(body) as ApiResponse<T>
      if (!parsed.success) throw new Error(`timviec.ai báo lỗi: ${parsed.msg ?? "không rõ"}`)
      return parsed
    }

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === maxRetries) throw errorForStatus(response.status)
    await new Promise((resolve) => setTimeout(resolve, delay + Math.floor(Math.random() * 500)))
    delay *= 2
  }

  throw new Error("không gọi được API")
}

export interface JobCard {
  /** Mã số của tin, ổn định, dùng làm externalId. */
  id: string
  slug: string
  title: string
  company: string | null
  companyUrl: null
  companyLogo: string | null
  /** Địa chỉ đầy đủ tới phường, kết thúc bằng tỉnh - backend suy mã tỉnh từ đây. */
  location: string | null
  workMode: null
  /** "Thỏa thuận"/"Thương lượng" được trả về null. */
  salary: string | null
  /** Lần đăng hoặc làm mới gần nhất (tin làm mới = vẫn đang tuyển), ISO 8601. */
  postedAt: string | null
  tags: string[]
  categories: string[]
  url: string
  /** Mô tả + Yêu cầu + Quyền lợi; API trả đủ nên backend không phải gọi `detail`. */
  description: string | null
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.normalize("NFC").trim()
  return trimmed ? trimmed : null
}

export const salaryOf = (value: string | null | undefined): string | null => {
  const salary = text(value)
  if (!salary || /th[oỏ]a thu[aậ]n|th[uư][oơ]ng l[uư][oợ]ng/i.test(salary)) return null
  return salary
}

function describeJob(job: ApiJob): string | null {
  const sections: string[] = []
  const description = text(job.job_description)
  const requirement = text(job.job_requirement)
  const benefit = text(job.job_benefit)
  if (description) sections.push(`Mô tả công việc:\n${description}`)
  if (requirement) sections.push(`Yêu cầu ứng viên:\n${requirement}`)
  if (benefit) sections.push(`Quyền lợi:\n${benefit}`)
  return sections.length ? sections.join("\n\n") : null
}

const postedAtOf = (value: string | number | null | undefined): string | null => {
  const ms = Number(value)
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null
}

export function toJobCard(job: ApiJob): JobCard | null {
  const id = text(String(job.id ?? ""))
  const title = text(job.title)
  if (!id || !title) return null

  return {
    id,
    slug: id,
    title,
    company: text(job.company_name),
    companyUrl: null,
    companyLogo: text(job.company_logo_url),
    location: text(job.job_address_display) ?? text(job.job_full_address),
    workMode: null,
    salary: salaryOf(job.salary),
    postedAt: postedAtOf(job.last_published_at) ?? postedAtOf(job.published_at),
    tags: [],
    categories: [],
    url: `${BASE_URL}/candidate/jobs/${id}`,
    description: describeJob(job),
  }
}

export const toJobCards = (jobs: ApiJob[]): JobCard[] =>
  jobs.map(toJobCard).filter((card): card is JobCard => card !== null)

/** API xếp theo độ liên quan, tin mới nằm rải rác ở mọi trang (đo 2026-10-17: 14/186 tin "kế toán" ≤ 7 ngày, trang 6 nhiều nhất). */
export const newestFirst = (cards: JobCard[]): JobCard[] =>
  [...cards].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))

/** Mã tin trong URL `/candidate/jobs/<id>/<slug>` hoặc chính mã số. */
export function idFrom(target: string): string | null {
  const id = target.match(/\/candidate\/jobs\/(\d+)/)?.[1] ?? target.trim()
  return /^\d{6,}$/.test(id) ? id : null
}

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()

const PLACE_ALIASES: Array<[RegExp, string]> = [
  [/\b(tp )?hcm\b|\btphcm\b|\bsai gon\b|\bthanh pho ho chi minh\b/g, "ho chi minh"],
]

const place = (value: string): string => {
  let folded = ` ${fold(value).replace(/[^a-z0-9]+/g, " ").trim()} `
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
