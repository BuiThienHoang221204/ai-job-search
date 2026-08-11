// Nguồn dữ liệu: API tìm kiếm công khai của VietnamWorks.
//
// KHÁC HẲN itviec-search và topcv-search: hai cái kia phân tích HTML, còn cái
// này gọi thẳng API JSON.
//
// Lý do là bắt buộc chứ không phải cho gọn. Trang /viec-lam của VietnamWorks
// là ứng dụng Next.js render hoàn toàn ở phía trình duyệt: HTML trả về chỉ có
// <div id="__next"></div> rỗng, và từ khoá tìm kiếm chỉ xuất hiện 2 lần trong
// 237KB - không có một tin tuyển dụng nào trong đó. Trang chi tiết cũng vậy,
// và cũng không nhúng __NEXT_DATA__. Parse HTML ở đây sẽ luôn trả về rỗng.
//
// Đổi lại thì API cho dữ liệu có cấu trúc sẵn: không regex, không lo đổi
// markup, và jobDescription + jobRequirement nằm NGAY trong kết quả tìm kiếm
// nên không cần thêm một request cho mỗi tin.
//
// Đây là API nội bộ, không có tài liệu công khai. Nó có thể đổi mà không báo -
// đó là cái giá phải trả, và cũng là lý do mọi trường đều đọc phòng thủ.
//
// robots.txt của vietnamworks.com chỉ chặn /my-profile, /apply, /login và vài
// đường dẫn nội bộ; trang và API tìm kiếm không bị chặn.

export const BASE_URL = "https://www.vietnamworks.com"
export const API_URL = "https://ms.vietnamworks.com/job-search/v1.0/search"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export interface JobCard {
  /** jobId của VietnamWorks, dùng làm externalId. */
  id: string
  /** Dạng "<alias>-<id>-jv", trích từ jobUrl - đủ để dựng lại URL. */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  /** Ảnh logo công ty, API trả sẵn ở trường `companyLogo`. */
  companyLogo: string | null
  location: string | null
  /** API không phân biệt remote/hybrid/onsite ở mức dùng được. */
  workMode: string | null
  salary: string | null
  postedAt: string | null
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

/** Một tin trong phản hồi API. Chỉ khai những trường thực sự dùng - phản hồi
 *  thật có hơn 100 trường. */
export interface ApiJob {
  jobId?: number
  jobTitle?: string
  jobUrl?: string
  alias?: string
  companyName?: string
  companyUrl?: string
  companyLogo?: string
  companyId?: number
  isSalaryVisible?: boolean
  prettySalary?: string
  address?: string
  workingLocations?: Array<{ address?: string }>
  skills?: Array<{ skillName?: string }>
  prettyApprovedOn?: string
  approvedOn?: string
  jobDescription?: string
  jobRequirement?: string
}

export interface ApiResponse {
  meta?: { code?: number; nbHits?: number; nbPages?: number; page?: number }
  data?: ApiJob[]
}

export interface SearchBody {
  query: string
  page: number
  hitsPerPage: number
  filter: unknown[]
  userId: number
}

/** Gọi API, lùi dần khi gặp 429/5xx. */
export async function apiSearch(body: SearchBody): Promise<ApiResponse> {
  const maxRetries = 4
  let delay = 1_000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Accept: "application/json",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/viec-lam`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })

    if (response.ok) return (await response.json()) as ApiResponse

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(
          `VietnamWorks trả về ${response.status} sau ${maxRetries + 1} lần thử`,
        )
      }
      const jitter = Math.floor(Math.random() * 400)
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay *= 2
      continue
    }

    throw new Error(`VietnamWorks trả về ${response.status}`)
  }

  throw new Error("không gọi được API")
}

/**
 * Bỏ dấu tiếng Việt, chuẩn hoá về NFD trước.
 *
 * Chuẩn hoá là bắt buộc chứ không phải cho chắc: cùng một chữ "ư" có thể được
 * lưu dạng một ký tự (NFC) hoặc dạng "u" kèm dấu móc rời (NFD), và hai dạng đó
 * KHÔNG bằng nhau khi so chuỗi. Mọi phép so khớp có dấu trong file này đều đi
 * qua đây.
 */
export const stripDiacritics = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")

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

/** API trả jobDescription và jobRequirement dưới dạng HTML, không phải text. */
export const htmlToText = (html: string): string =>
  decodeEntities(stripTags(html)).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()

/**
 * Trích slug từ jobUrl.
 *
 * jobUrl có dạng https://www.vietnamworks.com/<alias>-<id>-jv. Lấy phần cuối
 * đường dẫn thay vì tự ghép từ `alias` và `jobId`: alias trong dữ liệu có khi
 * còn dấu gạch thừa ở cuối, ghép tay sẽ ra URL 404.
 */
export function slugFromUrl(jobUrl: string | undefined): string | null {
  if (!jobUrl) return null
  return jobUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/[?#].*$/, "") || null
}

/** Ngược lại: lấy jobId từ slug dạng "<alias>-<id>-jv". */
export function idFromSlug(slug: string): string | null {
  return slug.match(/-(\d+)-jv$/)?.[1] ?? null
}

/**
 * Địa điểm: gộp workingLocations, lùi về `address` nếu không có.
 *
 * Bỏ hậu tố ", Vietnam" mà API luôn thêm vào - giữ lại thì mọi tin đều có nó
 * và bộ lọc thành phố phải xử lý thêm một biến thể vô nghĩa.
 */
export function parseLocation(job: ApiJob): string | null {
  const fromLocations = (job.workingLocations ?? [])
    .map((entry) => (entry.address ?? "").replace(/,\s*Vi[eệ]t\s*nam\s*$/i, "").trim())
    .filter(Boolean)

  if (fromLocations.length) return [...new Set(fromLocations)].join(", ")

  const fallback = (job.address ?? "").replace(/\s*-\s*Vi[eệ]t\s*Nam\s*$/i, "").trim()
  return fallback || null
}

/**
 * Mức lương.
 *
 * `isSalaryVisible: false` đi cùng prettySalary = "Thương lượng" và min/max =
 * 0. Trả null trong trường hợp đó: "0 ₫" là một con số SAI, còn null nói đúng
 * rằng tin không công bố lương.
 */
export function parseSalary(job: ApiJob): string | null {
  if (job.isSalaryVisible === false) return null
  const pretty = (job.prettySalary ?? "").trim()
  if (!pretty) return null
  // Bỏ dấu rồi mới so, KHÔNG liệt kê biến thể dấu bằng tay trong regex.
  // Viết tay kiểu /th[uư][oơ]ng l[uư][oơ]ng/ trông thì đúng nhưng hỏng lặng
  // lẽ: ký tự trong mã nguồn và ký tự trong dữ liệu có thể ở hai dạng chuẩn
  // hoá Unicode khác nhau, và khi đó regex không khớp mà cũng không báo gì.
  if (/thuong luong|negotiab/i.test(stripDiacritics(pretty))) return null
  return pretty
}

/** Chuyển một tin từ API thành thẻ việc làm. */
export function toJobCard(job: ApiJob): JobCard | null {
  const id = job.jobId !== undefined ? String(job.jobId) : null
  const slug = slugFromUrl(job.jobUrl)
  const title = (job.jobTitle ?? "").trim()
  if (!id || !slug || !title) return null

  return {
    id,
    slug,
    title: decodeEntities(title),
    company: job.companyName ? decodeEntities(job.companyName).trim() : null,
    companyUrl: job.companyUrl || null,
    companyLogo: job.companyLogo || null,
    location: parseLocation(job),
    workMode: null,
    salary: parseSalary(job),
    postedAt: job.prettyApprovedOn ?? job.approvedOn ?? null,
    tags: (job.skills ?? [])
      .map((skill) => (skill.skillName ?? "").trim())
      .filter(Boolean),
    url: job.jobUrl ?? `${BASE_URL}/${slug}`,
  }
}

/**
 * Mô tả đầy đủ: ghép phần mô tả và phần yêu cầu.
 *
 * Giữ hai tiêu đề khi ghép, vì khung chấm điểm phân biệt "công việc làm gì"
 * với "ứng viên cần gì"; gộp thành một khối văn xuôi sẽ làm mất phân biệt đó.
 */
export function toDescription(job: ApiJob): string | null {
  const parts: string[] = []
  const description = htmlToText(job.jobDescription ?? "")
  const requirement = htmlToText(job.jobRequirement ?? "")

  if (description) parts.push(`Mô tả công việc\n${description}`)
  if (requirement) parts.push(`Yêu cầu ứng viên\n${requirement}`)

  return parts.length ? parts.join("\n\n") : null
}

export function toJobDetail(job: ApiJob): JobDetail | null {
  const card = toJobCard(job)
  if (!card) return null
  return { ...card, description: toDescription(job) }
}

const slugify = (text: string): string =>
  stripDiacritics(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/**
 * So khớp địa điểm không dấu, chấp nhận tin đa thành phố
 * ("Ho Chi Minh - Ha Noi").
 *
 * Lọc theo tên QUỐC GIA nghĩa là "cả nước", tức không lọc gì. Portal này chỉ
 * đăng tin ở Việt Nam, nên "Vietnam" khớp mọi tin.
 *
 * Không xử lý riêng thì `--location Vietnam` sẽ loại sạch kết quả, vì địa điểm
 * trên tin là tên thành phố và "ha-noi" không chứa "vietnam". Đã gặp thật: một
 * lượt quét của hệ thống trả về 0 tin ở cả ba portal Việt Nam trong khi gọi CLI
 * trực tiếp thì có tin.
 */
const COUNTRY_WIDE = new Set(["vietnam", "viet-nam", "vn"])

export function matchesLocation(jobLocation: string | null, wanted: string): boolean {
  const target = slugify(wanted)
  if (!target || COUNTRY_WIDE.has(target)) return true
  if (!jobLocation) return false
  return slugify(jobLocation).includes(target)
}

/**
 * Dựng truy vấn để tra một tin theo slug.
 *
 * API KHÔNG cho lọc theo jobId - đã thử `filter: [{field:"jobId"}]` và nhận
 * 400. Cách chạy được là tìm bằng chính các từ trong alias rồi đối chiếu
 * jobId; đã kiểm tra trên tin thật, cách này trả về đúng một kết quả.
 *
 * Cắt còn 12 từ: alias có khi rất dài (tin nhồi từ khoá), và truy vấn quá dài
 * làm API trả về rỗng.
 */
export function queryFromSlug(slug: string): string {
  return slug
    .replace(/-\d+-jv$/, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 12)
    .join(" ")
}
