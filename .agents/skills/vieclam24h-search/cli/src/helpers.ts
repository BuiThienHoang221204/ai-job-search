export const BASE_URL = "https://vieclam24h.vn"

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

/** Trang chặn = thiếu `__NEXT_DATA__` (trang thử thách không mang dữ liệu Next.js). KHÔNG dò chữ "recaptcha": widget trong form góp ý có trên trang thật - bẫy đã sập ở joboko-search. */
export const isBlockedPage = (html: string): boolean => !html.includes('id="__NEXT_DATA__"')

/** Tải HTML, lùi dần khi gặp 403/429/5xx. Trả "" khi 404. Ném BlockedError khi gặp trang chặn. */
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
        throw new BlockedError("Vieclam24h trả trang chặn thay vì dữ liệu; tạm dừng quét portal này")
      }
      return html
    }

    const retryable =
      response.status === 429 || response.status === 403 || response.status >= 500
    if (!retryable || attempt === maxRetries) {
      throw new Error(`Vieclam24h trả về ${response.status}`)
    }
    const jitter = Math.floor(Math.random() * 500)
    await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    delay *= 2
  }

  throw new Error("không thể tải trang")
}

/** Tải file tĩnh (sitemap XML) - KHÔNG qua `htmlFetch`: thiếu `__NEXT_DATA__` ở đây là bình thường, qua đó sẽ bị báo nhầm BLOCKED và cả portal bị tạm ngừng. */
export async function textFetch(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) })
  if (response.status === 404) return ""
  if (!response.ok) throw new Error(`Vieclam24h trả về ${response.status} cho ${url}`)
  return response.text()
}

export interface JobCard {
  id: string
  /** Dạng "<nganh>/<ten-tin>-c<nganh>p<tinh>id<id>" - đúng đường dẫn trang chi tiết, bỏ ".html". */
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  companyLogo: string | null
  location: string | null
  workMode: string | null
  /** Dựng từ `salary_min`/`salary_max` (VND); 0 nghĩa là "Thoả thuận" và trả null. */
  salary: string | null
  /** `approved_at` - lúc tin được DUYỆT đăng. Không dùng `refresh_at`: đó là mốc "làm mới" trả phí, đổi hằng giờ. */
  postedAt: string | null
  /** `smart_tags` loại Skill của chính portal ("Kế toán & hạch toán"...). */
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

export const nfc = (text: string): string => text.normalize("NFC")

/** Bỏ dấu, đổi mọi thứ không phải chữ số thành một khoảng trắng - dạng so khớp theo RANH GIỚI TỪ. */
export const fold = (text: string): string =>
  ` ${text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `

/** `fold(haystack)` có chứa nguyên cụm `phrase` không - "ke toan" KHÔNG khớp "an toan". */
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

type NextData = {
  props?: {
    initialState?: {
      api?: {
        initCommon?: { data?: { provinces?: Province[]; occupation?: Occupation[] } }
        jobDetailHiddenContact?: { data?: RawJob }
      }
    }
    /** Trang ngành cha để danh sách ở `jobsResponse`, trang ngành con ở `jobs` - tìm theo HÌNH DẠNG chứ không theo tên khoá. */
    initialProps?: { pageProps?: Record<string, unknown> }
  }
}

type Province = { id: number; name: string }
type Occupation = { id: number; slug: string }

export type RawJob = {
  id: number
  title: string
  title_slug: string
  occupation_ids_main?: number[]
  province_ids?: number[]
  employer_info?: { name?: string; slug?: string; logo?: string }
  salary_min?: number
  salary_max?: number
  approved_at?: number
  created_at?: number
  smart_tags?: Array<{ name?: string; category?: string }>
  description_html?: string
  job_requirement_html?: string
  other_requirement_html?: string
  benefit_html?: string
}

/** Đọc JSON nhúng của Next.js - nguồn dữ liệu chính của portal này, bền hơn bóc HTML. */
export function parseNextData(html: string): NextData | null {
  const body = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!body) return null
  try {
    return JSON.parse(body) as NextData
  } catch {
    return null
  }
}

const formatMillions = (amount: number): string =>
  `${Math.round((amount / 1_000_000) * 10) / 10} triệu`

export function salaryText(min?: number, max?: number): string | null {
  if (min && max && max !== min) return `${formatMillions(min)} - ${formatMillions(max)}`
  if (min) return `Từ ${formatMillions(min)}`
  if (max) return `Đến ${formatMillions(max)}`
  return null
}

const epochIso = (seconds?: number): string | null =>
  seconds ? new Date(seconds * 1000).toISOString() : null

/** Đổi một tin thô (thẻ danh sách hoặc trang chi tiết) sang hợp đồng chung. Thiếu ngành hoặc tỉnh thì không dựng được URL, bỏ tin. */
export function toCard(job: RawJob, data: NextData): JobCard | null {
  const common = data.props?.initialState?.api?.initCommon?.data
  const occupationId = job.occupation_ids_main?.[0]
  const provinceId = job.province_ids?.[0]
  const occupationSlug = common?.occupation?.find((o) => o.id === occupationId)?.slug
  if (!job.id || !job.title || !job.title_slug || !occupationSlug || !provinceId) return null

  const slug = `${occupationSlug}/${job.title_slug}-c${occupationId}p${provinceId}id${job.id}`
  const provinces = (job.province_ids ?? [])
    .map((id) => common?.provinces?.find((p) => p.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  const employer = job.employer_info

  return {
    id: String(job.id),
    slug,
    title: nfc(job.title).trim(),
    company: employer?.name ? nfc(employer.name).trim() || null : null,
    // Chưa kiểm được dạng URL trang công ty; một link đoán mà hỏng còn tệ hơn không có link.
    companyUrl: null,
    companyLogo: employer?.logo ?? null,
    location: provinces.length ? nfc(provinces.join(", ")) : null,
    workMode: null,
    salary: salaryText(job.salary_min, job.salary_max),
    postedAt: epochIso(job.approved_at ?? job.created_at),
    tags: (job.smart_tags ?? [])
      .filter((tag) => tag.category === "Skill" && tag.name)
      .map((tag) => nfc(tag.name!)),
    url: `${BASE_URL}/${slug}.html`,
  }
}

export function parseJobCards(html: string): JobCard[] {
  const data = parseNextData(html)
  const lists = Object.values(data?.props?.initialProps?.pageProps ?? {})
  const holder = lists.find(
    (value): value is { items: RawJob[] } =>
      typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items),
  )
  const items = holder?.items ?? []
  const seen = new Set<string>()
  return items
    .map((item) => toCard(item, data!))
    .filter((card): card is JobCard => {
      if (!card || seen.has(card.id)) return false
      seen.add(card.id)
      return true
    })
}

/** Ghép các khối mô tả của trang chi tiết, GIỮ tiêu đề từng khối để khung chấm điểm tách được mô tả với yêu cầu. */
export function describeJob(job: RawJob): string | null {
  const blocks = (
    [
      ["Mô tả công việc", job.description_html],
      ["Yêu cầu ứng viên", job.job_requirement_html],
      ["Yêu cầu khác", job.other_requirement_html],
      ["Quyền lợi", job.benefit_html],
    ] as const
  )
    .map(([heading, html]) => {
      const text = html ? clean(html) : ""
      return text.length > 10 ? `${heading}\n${text}` : ""
    })
    .filter(Boolean)
  return blocks.length ? blocks.join("\n\n") : null
}

export function parseDetail(html: string): JobDetail | null {
  const data = parseNextData(html)
  const job = data?.props?.initialState?.api?.jobDetailHiddenContact?.data
  if (!data || !job) return null
  const card = toCard(job, data)
  return card ? { ...card, description: describeJob(job) } : null
}

/**
 * Vieclam24h KHÔNG tìm được theo từ khoá tự do trong phạm vi robots.txt cho phép:
 * `?keyword=` bị trang bỏ qua (đo 2026-09-29: "kế toán" ra 0/30 tin liên quan,
 * toàn tin trả phí), còn tham số tìm kiếm thật `q` thì robots.txt chặn (`/*?q`).
 * Nên từ khoá được ÁNH XẠ sang ngành nghề, rồi lấy trang ngành
 * `/viec-lam-<nganh>-o<id>.html` (trang "Kế toán": 16/20 tin đúng ngành).
 *
 * `phrases` so theo RANH GIỚI TỪ sau khi bỏ dấu. Bảng lấy từ `initCommon.occupation`
 * của chính trang (53 ngành, 2026-09-29) cộng bí danh chức danh hay gặp.
 */
export const OCCUPATIONS: ReadonlyArray<{ id: number; slug: string; phrases: string[] }> = [
  { id: 1, slug: "hanh-chinh-thu-ky", phrases: ["hành chính", "thư ký", "lễ tân", "văn phòng", "trợ lý"] },
  { id: 2, slug: "an-ninh-bao-ve", phrases: ["an ninh", "bảo vệ"] },
  { id: 3, slug: "thiet-ke-sang-tao-nghe-thuat", phrases: ["thiết kế đồ họa", "designer", "graphic design", "ui ux", "sáng tạo"] },
  { id: 4, slug: "kien-truc-thiet-ke-noi-ngoai-that", phrases: ["kiến trúc", "nội thất", "ngoại thất"] },
  { id: 5, slug: "khach-san-nha-hang-du-lich", phrases: ["khách sạn", "nhà hàng", "du lịch", "lễ tân khách sạn", "phục vụ", "đầu bếp", "bếp"] },
  { id: 6, slug: "ban-si-ban-le-quan-ly-cua-hang", phrases: ["bán lẻ", "bán sỉ", "quản lý cửa hàng", "cửa hàng trưởng"] },
  { id: 7, slug: "it-phan-cung-mang", phrases: ["phần cứng", "quản trị mạng", "network", "it helpdesk", "helpdesk", "system admin", "it support"] },
  {
    id: 8,
    slug: "it-phan-mem",
    phrases: [
      "phần mềm", "lập trình", "lập trình viên", "developer", "software", "frontend", "front end",
      "backend", "back end", "fullstack", "full stack", "web developer", "mobile", "android", "ios",
      "reactjs", "react", "nodejs", "java", "python", "php", "golang", ".net", "devops", "tester",
      "kiểm thử", "qa", "qc phần mềm",
    ],
  },
  { id: 9, slug: "san-xuat-lap-rap-che-bien", phrases: ["sản xuất", "lắp ráp", "chế biến", "công nhân"] },
  { id: 10, slug: "van-hanh-bao-tri-bao-duong", phrases: ["vận hành", "bảo trì", "bảo dưỡng"] },
  { id: 11, slug: "nong-lam-ngu-nghiep", phrases: ["nông nghiệp", "lâm nghiệp", "ngư nghiệp", "nông lâm"] },
  { id: 12, slug: "marketing", phrases: ["marketing", "seo", "content", "digital marketing", "truyền thông số"] },
  { id: 13, slug: "ban-hang-kinh-doanh", phrases: ["kinh doanh", "bán hàng", "sales", "telesales", "tư vấn bán hàng"] },
  { id: 14, slug: "thu-mua-kho-van-chuoi-cung-ung", phrases: ["thu mua", "kho vận", "thủ kho", "kho", "chuỗi cung ứng", "logistics", "supply chain", "mua hàng"] },
  { id: 15, slug: "xuat-nhap-khau", phrases: ["xuất nhập khẩu", "import export", "chứng từ xuất nhập khẩu"] },
  { id: 16, slug: "van-tai-lai-xe-giao-nhan", phrases: ["vận tải", "lái xe", "tài xế", "giao nhận", "giao hàng", "shipper"] },
  { id: 17, slug: "ke-toan", phrases: ["kế toán", "accountant", "accounting"] },
  { id: 18, slug: "tai-chinh-dau-tu-chung-khoan", phrases: ["tài chính", "đầu tư", "chứng khoán", "phân tích tài chính", "finance"] },
  { id: 19, slug: "ngan-hang", phrases: ["ngân hàng", "giao dịch viên", "tín dụng", "banking"] },
  { id: 20, slug: "khai-thac-nang-luong-khoang-san-dia-chat", phrases: ["khoáng sản", "địa chất", "năng lượng"] },
  { id: 21, slug: "y-te-cham-soc-suc-khoe", phrases: ["y tế", "điều dưỡng", "y tá", "bác sĩ", "chăm sóc sức khỏe", "xét nghiệm", "hộ lý"] },
  { id: 22, slug: "nhan-su", phrases: ["nhân sự", "tuyển dụng", "hr", "hành chính nhân sự"] },
  { id: 23, slug: "bao-hiem", phrases: ["bảo hiểm"] },
  { id: 24, slug: "thong-tin-truyen-thong-quang-cao", phrases: ["truyền thông", "quảng cáo", "pr", "sự kiện"] },
  { id: 25, slug: "luat-phap-ly-tuan-thu", phrases: ["luật", "pháp lý", "pháp chế", "tuân thủ", "luật sư"] },
  { id: 26, slug: "kiem-toan", phrases: ["kiểm toán", "auditor", "audit"] },
  { id: 27, slug: "quan-ly-du-an", phrases: ["quản lý dự án", "project manager"] },
  { id: 28, slug: "quan-ly-tieu-chuan-va-chat-luong", phrases: ["chất lượng", "qa qc", "kiểm soát chất lượng", "iso"] },
  { id: 29, slug: "bat-dong-san", phrases: ["bất động sản", "môi giới"] },
  { id: 30, slug: "cham-soc-khach-hang", phrases: ["chăm sóc khách hàng", "cskh", "customer service", "tổng đài"] },
  { id: 31, slug: "xay-dung", phrases: ["xây dựng", "giám sát công trình", "kỹ sư xây dựng", "qs", "công trình"] },
  { id: 32, slug: "giao-duc-dao-tao", phrases: ["giáo dục", "đào tạo", "giáo viên", "giảng viên", "gia sư", "teacher", "trợ giảng"] },
  { id: 33, slug: "phan-tich-thong-ke-du-lieu", phrases: ["phân tích dữ liệu", "data analyst", "data engineer", "data scientist", "thống kê", "business intelligence"] },
  { id: 34, slug: "khoa-hoc-ky-thuat", phrases: ["khoa học kỹ thuật", "nghiên cứu khoa học"] },
  { id: 36, slug: "an-toan-lao-dong", phrases: ["an toàn lao động", "hse", "ehs"] },
  { id: 37, slug: "bien-phien-dich", phrases: ["biên dịch", "phiên dịch", "thông dịch"] },
  { id: 38, slug: "buu-chinh-vien-thong", phrases: ["bưu chính", "viễn thông"] },
  { id: 39, slug: "dau-khi", phrases: ["dầu khí"] },
  { id: 40, slug: "det-may-da-giay-thoi-trang", phrases: ["dệt may", "da giày", "thời trang", "may mặc"] },
  { id: 41, slug: "dien-dien-tu-dien-lanh", phrases: ["điện", "điện tử", "điện lạnh", "kỹ sư điện"] },
  { id: 42, slug: "duoc-pham", phrases: ["dược", "dược sĩ", "dược phẩm", "trình dược viên"] },
  { id: 43, slug: "hoa-hoc-hoa-sinh", phrases: ["hóa học", "hóa sinh"] },
  { id: 44, slug: "moi-truong-xu-ly-chat-thai", phrases: ["môi trường", "xử lý chất thải"] },
  { id: 45, slug: "thuc-pham-do-uong", phrases: ["thực phẩm", "đồ uống", "pha chế", "barista"] },
  { id: 46, slug: "chan-nuoi-thu-y", phrases: ["chăn nuôi", "thú y"] },
  { id: 47, slug: "co-khi-o-to-tu-dong-hoa", phrases: ["cơ khí", "ô tô", "tự động hóa", "cnc"] },
  { id: 48, slug: "cong-nghe-thuc-pham-dinh-duong", phrases: ["công nghệ thực phẩm", "dinh dưỡng"] },
  { id: 49, slug: "lao-dong-pho-thong", phrases: ["lao động phổ thông", "phụ việc", "tạp vụ"] },
  { id: 51, slug: "truyen-hinh-bao-chi-bien-tap", phrases: ["báo chí", "biên tập", "phóng viên", "truyền hình"] },
  { id: 52, slug: "xuat-ban-in-an", phrases: ["xuất bản", "in ấn"] },
  { id: 53, slug: "thuc-tap-sinh", phrases: ["thực tập sinh", "thực tập", "intern", "internship"] },
]

/**
 * Chọn MỘT ngành cho từ khoá: cụm khớp ĐỨNG SỚM NHẤT thắng (QueryPlanner xếp chức
 * danh trước, lĩnh vực sau - "kế toán logistics" là việc kế toán), hoà thì cụm DÀI
 * hơn thắng ("an toàn lao động" thắng "lao động"). Không khớp gì thì null.
 */
export function occupationFor(
  query: string,
): { id: number; slug: string; phrases: string[] } | null {
  let best: { id: number; slug: string; phrases: string[]; at: number; length: number } | null = null
  for (const occupation of OCCUPATIONS) {
    for (const phrase of occupation.phrases) {
      const at = containsPhrase(query, phrase)
      if (at === -1) continue
      const length = fold(phrase).length
      if (!best || at < best.at || (at === best.at && length > best.length)) {
        best = { ...occupation, at, length }
      }
    }
  }
  return best ? { id: best.id, slug: best.slug, phrases: best.phrases } : null
}

export function categoryUrl(occupation: { id: number; slug: string }, page?: number): string {
  const base = `${BASE_URL}/viec-lam-${occupation.slug}-o${occupation.id}.html`
  return page && page > 1 ? `${base}?page=${page}` : base
}

/**
 * Trang ngành của Vieclam24h lẫn tin lạc đề (đo 2026-09-29: "IT Phần mềm" có cả
 * "Giáo viên Tin học", "Chuyên viên Đào tạo nội bộ"). Mỗi tin lạc đề vẫn tốn một
 * lượt rút yêu cầu và bị chấm với MỌI người dùng, nên BỎ hẳn tin mà chức danh
 * không chứa cụm nào của ngành đã chọn hay của chính từ khoá. So theo cụm của
 * NGÀNH chứ không chỉ theo từ khoá, để "accountant" vẫn giữ tin "Kế toán ...".
 */
export function relevantTo(card: JobCard, query: string, phrases: readonly string[]): boolean {
  return [query, ...phrases].some((phrase) => containsPhrase(card.title, phrase) !== -1)
}

/** Trang ngành còn lẫn tin trả phí của ngành khác; xếp tin có chữ của từ khoá trong chức danh lên đầu, giữ thứ tự gốc khi hoà. */
export function rankByQuery(cards: JobCard[], query: string): JobCard[] {
  const words = fold(query).trim().split(" ").filter((word) => word.length > 1)
  const score = (card: JobCard) => words.filter((word) => fold(card.title).includes(` ${word} `)).length
  return cards
    .map((card, index) => ({ card, index, score: score(card) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ card }) => card)
}

/** "TP.HCM", "Hồ Chí Minh", "Sài Gòn" là MỘT nơi; portal ghi "TP.HCM" còn hồ sơ gửi "Ho Chi Minh". */
const PLACE_ALIASES: Record<string, string> = {
  " tp hcm ": " ho chi minh ",
  " hcm ": " ho chi minh ",
  " tphcm ": " ho chi minh ",
  " sai gon ": " ho chi minh ",
  " tp ho chi minh ": " ho chi minh ",
  " thanh pho ho chi minh ": " ho chi minh ",
  " hn ": " ha noi ",
}

const place = (text: string): string => {
  let folded = fold(text)
  for (const [alias, canonical] of Object.entries(PLACE_ALIASES)) {
    folded = folded.split(alias).join(canonical)
  }
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
