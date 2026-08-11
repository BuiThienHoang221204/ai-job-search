// Nguồn dữ liệu: trang tìm việc công khai của TopCV.
//
// robots.txt của topcv.vn chỉ chặn các đường dẫn liên quan tới CV cá nhân
// (/cv/, /xem-cv/, /sua-cv/, /cv-ung-vien/...). Trang /tim-viec-lam-* và
// /viec-lam/* không bị chặn.
//
// Trang render sẵn ở máy chủ. Mỗi thẻ tin mang data-job-id là số nguyên ổn
// định - dùng làm externalId để chống trùng giữa các lần chạy mà không phụ
// thuộc slug (slug đổi khi tin được sửa tiêu đề).
//
// Phân tích bằng regex thay vì DOM parser: markup nông, và CLI này giữ nguyên
// tắc zero runtime dependency giống itviec-search và linkedin-search.

export const BASE_URL = "https://www.topcv.vn"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi,en;q=0.9",
}

/**
 * Tải trang bằng `curl`.
 *
 * ĐÂY LÀ ĐƯỜNG CHÍNH, không phải đường dự phòng - và đó là điều khác biệt lớn
 * nhất so với itviec-search.
 *
 * TopCV đứng sau Cloudflare, mà Cloudflare nhận dạng client qua VÂN TAY TLS
 * (JA3) chứ không chỉ qua header. Bắt tay TLS của bun bị xếp là bot: đã đo xen
 * kẽ ba lượt, cùng URL cùng User-Agent, curl trả 200 cả ba lần còn fetch của
 * bun trả 403 cả ba lần. Đổi header không cứu được vì vấn đề nằm dưới tầng
 * HTTP.
 *
 * Cái giá phải trả là CLI này cần có `curl` trên máy - khác với các portal
 * khác vốn không phụ thuộc gì. Đổi lại thì nó chạy được; không có curl thì
 * TopCV đơn giản là không quét được.
 *
 * AN TOÀN: dùng mảng tham số, không nối chuỗi vào shell. URL do chính
 * `searchUrl()` dựng từ từ khoá đã slugify nên không chứa ký tự lạ, nhưng vẫn
 * giữ nguyên tắc này để một thay đổi sau này không mở ra lỗ hổng.
 */
async function curlFetch(url: string): Promise<{ status: number; body: string }> {
  const args = ["-sS", "-L", "--max-time", "25", "-w", "\n%{http_code}", url]
  for (const [name, value] of Object.entries(HEADERS)) args.push("-H", `${name}: ${value}`)

  const proc = Bun.spawn(["curl", ...args], { stdout: "pipe", stderr: "pipe" })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited

  if (code !== 0) {
    throw new Error(
      code === 127 || /not found|khong tim thay/i.test(err)
        ? "không tìm thấy lệnh curl; TopCV cần curl vì Cloudflare chặn client khác"
        : `curl lỗi (mã ${code}): ${err.trim().slice(0, 200)}`,
    )
  }

  // -w ghi mã trạng thái vào dòng cuối, tách khỏi thân trang.
  const cut = out.lastIndexOf("\n")
  return { status: Number(out.slice(cut + 1).trim()), body: out.slice(0, cut) }
}

/**
 * Tải HTML, lùi dần khi gặp 403/429/5xx. Trả "" khi 404.
 *
 * Mốc lùi ban đầu dài hơn hẳn itviec-search (2 giây so với 0,7 giây) vì
 * Cloudflare cần nghỉ lâu hơn mới thả.
 */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 4
  let delay = 2_000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { status, body } = await curlFetch(url)

    if (status === 404) return ""
    if (status >= 200 && status < 300) return body

    if (status === 429 || status === 403 || status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(
          `TopCV trả về ${status} sau ${maxRetries + 1} lần thử` +
            (status === 403 ? " (Cloudflare chặn; thử giảm tần suất)" : ""),
        )
      }
      // Thêm nhiễu ngẫu nhiên: khi cron chạy nhiều truy vấn liên tiếp và cùng
      // gặp 403, lùi đúng bằng nhau sẽ khiến chúng thử lại đồng loạt và lại
      // cùng bị chặn tiếp.
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay *= 2
      continue
    }

    throw new Error(`TopCV trả về ${status}`)
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
  /** Ảnh logo công ty, lấy từ thẻ <img> trong khối avatar của thẻ tin. */
  companyLogo: string | null
  location: string | null
  /** TopCV không ghi hình thức làm việc trên thẻ tìm kiếm. */
  workMode: string | null
  /** Nhiều tin ghi "Thoả thuận" thay vì con số. */
  salary: string | null
  postedAt: string | null
  /** TopCV không gắn tag công nghệ trên thẻ; dùng số năm kinh nghiệm nếu có. */
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

/**
 * Bỏ dấu tiếng Việt, chuẩn hoá về NFD trước.
 *
 * Chuẩn hoá là bắt buộc: cùng một chữ "ả" có thể được lưu dạng một ký tự (NFC)
 * hoặc dạng "a" kèm dấu hỏi rời (NFD), và hai dạng đó KHÔNG bằng nhau khi so
 * chuỗi. Mọi phép so khớp có dấu trong file này đều đi qua đây.
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

/** Giải mã thực thể HTML. TopCV escape hai lần ở thuộc tính title nên hàm này
 *  có thể phải chạy hai lượt - xem parseCardLocation. */
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

const clean = (html: string): string =>
  decodeEntities(stripTags(html)).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()

/**
 * Cắt trang thành từng thẻ tin.
 *
 * Các thẻ lồng nhau nên không dùng được regex đơn. Cắt theo mốc mở
 * `<div class="job-item-search-result` rồi lấy đến mốc kế tiếp.
 */
export function splitJobCards(html: string): string[] {
  const marker = '<div class="job-item-search-result'
  const cards: string[] = []
  let index = html.indexOf(marker)

  while (index !== -1) {
    const next = html.indexOf(marker, index + marker.length)
    cards.push(next === -1 ? html.slice(index) : html.slice(index, next))
    index = next
  }
  return cards
}

/**
 * Địa điểm nằm trong `<span class="city-text">`.
 *
 * KHÔNG lấy từ thuộc tính title= của `<label class="address">`: TopCV nhét cả
 * một khối HTML đã escape hai lần vào đó (bảng thông báo đổi địa giới hành
 * chính), nên bóc ra sẽ dính cả câu "Địa điểm làm việc đã được cập nhật...".
 */
export function parseCardLocation(card: string): string | null {
  const raw = card.match(/<span class="city-text">([\s\S]{0,120}?)<\/span>/)?.[1]
  if (!raw) return null
  const text = clean(raw)
  return text.length ? text : null
}

/**
 * Ngày đăng: TopCV ghi "Đăng 1 tuần trước" ở cuối thẻ.
 *
 * So trên bản ĐÃ BỎ DẤU rồi trả lại chính chuỗi đã bỏ dấu. Hai lý do:
 * `parsePostedAt` ở backend nhận cả hai dạng, và so trên bản có dấu thì lại
 * vướng đúng cái bẫy chuẩn hoá Unicode đã gặp hai lần trong file này.
 */
export function parseCardPostedAt(card: string): string | null {
  const match = stripDiacritics(clean(card)).match(
    /dang\s+([^|\n]{1,24}?truoc)/i,
  )
  return match?.[1]?.trim() ?? null
}

export function parseJobCard(card: string): JobCard | null {
  const id = card.match(/data-job-id="(\d+)"/)?.[1]
  if (!id) return null

  // Link chi tiết có dạng /viec-lam/<slug>/<id>.html?tham-so...
  // Cắt bỏ query: tham số u_sr_id đổi mỗi lần tải trang, giữ lại sẽ khiến cùng
  // một tin trông như hai tin khác nhau.
  const detailPath = card.match(
    /href="https:\/\/www\.topcv\.vn\/viec-lam\/([^"?]+)\.html/,
  )?.[1]
  if (!detailPath) return null

  // Tiêu đề nằm ở thuộc tính title= của <span> bên trong <h3 class="title">.
  // Lấy từ đó thay vì nội dung thẻ: nội dung bị cắt bớt bằng CSS ở tin dài,
  // còn title= luôn đầy đủ.
  const titleFromAttr = card.match(
    /<h3 class="title[^"]*">[\s\S]{0,600}?<span[^>]*\btitle="([^"]+)"/,
  )?.[1]
  const titleFromText = card.match(
    /<h3 class="title[^"]*">[\s\S]{0,800}?<a[^>]*>[\s\S]{0,300}?<span[^>]*>([\s\S]{1,200}?)<\/span>/,
  )?.[1]
  const title = clean(titleFromAttr ?? titleFromText ?? "")

  const company = card.match(/<span class="company-name"[^>]*\btitle="([^"]+)"/)?.[1]
  const companyPath = card.match(/href="(https:\/\/www\.topcv\.vn\/cong-ty\/[^"?]+)/)?.[1]

  // Lấy từ <label class="salary">, KHÔNG lấy <label class="title-salary">:
  // hai chỗ cùng giá trị nhưng title-salary nằm trong khối box-right vốn còn
  // chứa nút "Xem nhanh", dễ bóc nhầm.
  const salaryRaw = card.match(
    /<label class="salary">([\s\S]{0,120}?)<\/label>/,
  )?.[1]
  const salary = salaryRaw ? clean(salaryRaw) : null

  const exp = card.match(/<label class="exp">([\s\S]{0,80}?)<\/label>/)?.[1]

  return {
    id,
    slug: detailPath,
    title,
    company: company ? decodeEntities(company).trim() : null,
    companyUrl: companyPath ?? null,
    // Ảnh nằm ở `data-src` chứ không phải `src`: TopCV tải ảnh trễ (lazy),
    // `src` chỉ chứa ảnh giữ chỗ dùng chung cho mọi thẻ. Lấy nhầm `src` thì
    // mọi công ty đều chung một logo.
    companyLogo:
      card.match(/<img[^>]*\bdata-src="([^"]+)"/)?.[1]?.trim() ?? null,
    location: parseCardLocation(card),
    workMode: null,
    // "Thoả thuận" không phải một mức lương. Bỏ dấu rồi mới so, KHÔNG liệt kê
    // biến thể dấu bằng tay: ký tự trong mã nguồn và trong dữ liệu có thể ở
    // hai dạng chuẩn hoá Unicode khác nhau, khi đó regex không khớp mà cũng
    // không báo gì.
    salary:
      salary && !/thoa thuan|thuong luong|negotiab/i.test(stripDiacritics(salary))
        ? salary
        : null,
    // TopCV ghi "Đăng 1 tuần trước" ở cuối thẻ. So trên bản ĐÃ BỎ DẤU rồi trả
    // lại chính chuỗi đã bỏ dấu: parsePostedAt ở backend nhận cả hai dạng, và
    // so trên bản có dấu thì lại vướng đúng cái bẫy chuẩn hoá Unicode đã gặp
    // hai lần trong file này.
    postedAt: parseCardPostedAt(card),
    tags: exp ? [clean(exp)].filter(Boolean) : [],
    url: `${BASE_URL}/viec-lam/${detailPath}.html`,
  }
}

export function parseJobCards(html: string): JobCard[] {
  return splitJobCards(html)
    .map(parseJobCard)
    .filter((card): card is JobCard => card !== null && card.title.length > 0)
}

/**
 * Bóc mô tả từ trang chi tiết.
 *
 * Trang chia nội dung thành các khối box-job-information-detail-item, mỗi khối
 * có một tiêu đề <h2> ("Mô tả công việc", "Yêu cầu ứng viên", "Quyền lợi",
 * "Địa điểm làm việc") và một khối __text.
 *
 * Giữ lại tiêu đề khi ghép: khung chấm điểm phân biệt phần mô tả với phần yêu
 * cầu, nên gộp thành một khối văn xuôi sẽ làm mất thông tin đó.
 */
export function parseJobDescription(html: string): string | null {
  const blocks = [
    ...html.matchAll(
      /box-job-information-detail-item__title--title">([\s\S]{0,120}?)<\/h2>[\s\S]{0,400}?box-job-information-detail-item__text">([\s\S]*?)<\/div>\s*<\/div>/g,
    ),
  ]
    .map(([, heading, body]) => {
      const title = clean(heading!)
      const text = clean(body!)
      return text.length > 20 ? `${title}\n${text}` : ""
    })
    .filter(Boolean)

  if (!blocks.length) return null
  return blocks.join("\n\n")
}

/**
 * Bóc chức danh và tên công ty từ trang chi tiết.
 *
 * Trang chi tiết của TopCV KHÔNG có thẻ `<h1>` và cũng không có `og:title` -
 * đã kiểm tra trên trang thật. Chỗ duy nhất có chức danh dạng sạch là thẻ
 * `<title>`, theo khuôn "Tuyển {chức danh} làm việc tại {công ty}".
 *
 * Khuôn này là quy ước của TopCV chứ không phải chuẩn nào, nên nếu không khớp
 * thì trả nguyên chuỗi thay vì trả rỗng: một tiêu đề hơi dài vẫn dùng được,
 * còn tiêu đề rỗng thì tin bị loại khỏi kết quả.
 */
export function parseDetailTitle(html: string): {
  title: string
  company: string | null
} {
  const raw = html.match(/<title>([\s\S]{0,300}?)<\/title>/)?.[1]
  if (!raw) return { title: "", company: null }

  const text = decodeEntities(raw).replace(/\s+/g, " ").trim()
  const match = text.match(/^Tuy[eể]n\s+([\s\S]+?)\s+l[aà]m vi[eệ]c t[aạ]i\s+([\s\S]+)$/i)

  if (!match) return { title: text, company: null }
  return { title: match[1]!.trim(), company: match[2]!.trim() || null }
}

const slugify = (text: string): string =>
  stripDiacritics(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/**
 * Dựng URL trang tìm kiếm.
 *
 * TopCV dùng đường dẫn dạng /tim-viec-lam-<tu-khoa> và phân trang bằng ?page=.
 * Bộ lọc thành phố đi qua `cityIds[]` với MÃ SỐ chứ không phải tên, mà bảng mã
 * đó không công bố. Vì vậy địa điểm không đưa vào URL; lọc thật làm ở phía
 * client sau khi parse - giống hệt cách itviec-search xử lý.
 */
export function searchUrl(options: { query?: string; page?: number }): string {
  const keyword = options.query ? slugify(options.query) : ""
  const path = keyword ? `/tim-viec-lam-${keyword}` : "/tim-viec-lam"

  const params = new URLSearchParams()
  if (options.page && options.page > 1) params.set("page", String(options.page))

  const qs = params.toString()
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`
}

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
