// Nguồn dữ liệu: trang danh sách việc làm công khai của ITviec.
//
// robots.txt của itviec.com cho phép "Allow: /" với mọi bot và chỉ chặn
// /subscriptions/new, nên các trang /it-jobs/* nằm trong phạm vi được phép.
//
// Trang do Rails render sẵn kèm Stimulus controller. Mỗi thẻ việc làm mang
// data-job-key là UUID ổn định - dùng làm externalId để chống trùng giữa các
// lần chạy mà không phụ thuộc vào slug (slug có thể đổi khi tin được sửa).
//
// Phân tích bằng regex thay vì DOM parser: markup nông, và CLI này giữ
// nguyên tắc zero runtime dependency giống linkedin-search.

export const BASE_URL = "https://itviec.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Tải HTML, lùi dần khi gặp 429/5xx. Trả "" khi 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 5
  let delay = 700

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi,en;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    })

    if (response.status === 404) return ""
    if (response.ok) return response.text()

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`ITviec trả về ${response.status} sau ${maxRetries + 1} lần thử`)
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
      continue
    }

    throw new Error(`ITviec trả về ${response.status}`)
  }

  throw new Error("không thể tải trang")
}

export interface JobCard {
  /** data-job-key: UUID ổn định, dùng làm externalId. */
  id: string
  slug: string
  title: string
  company: string | null
  companyUrl: string | null
  /** Ảnh logo công ty, lấy từ `data-src` của thẻ <img> tải trễ. */
  companyLogo: string | null
  location: string | null
  /** "At office" | "Remote" | "Hybrid" theo cách ITviec ghi. */
  workMode: string | null
  /** Phần lớn tin ẩn lương sau đăng nhập, khi đó trường này là null. */
  salary: string | null
  postedAt: string | null
  tags: string[]
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
}

const stripTags = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")

/**
 * Giải mã thực thể HTML. Chỉ các thực thể thật sự xuất hiện trong markup
 * ITviec.
 */
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
 * Cắt trang thành từng thẻ việc làm.
 *
 * Các thẻ lồng nhau nên không dùng được regex đơn. Cách chắc chắn là cắt theo
 * mốc mở `<div class='job-card` rồi lấy đến mốc kế tiếp.
 */
export function splitJobCards(html: string): string[] {
  const marker = "<div class='job-card"
  const cards: string[] = []
  let index = html.indexOf(marker)

  while (index !== -1) {
    const next = html.indexOf(marker, index + marker.length)
    cards.push(next === -1 ? html.slice(index) : html.slice(index, next))
    index = next
  }
  return cards
}

export function parseJobCard(card: string): JobCard | null {
  const id = card.match(/data-job-key='([^']+)'/)?.[1]
  const slug = card.match(/job-slug-value='([^']+)'/)?.[1]
  if (!id || !slug) return null

  const titleHtml = card.match(/jobTitle'[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]

  // Lấy nội dung thẻ <a>, không phải cả đoạn khớp - nhầm chuyện này sẽ kéo cả
  // chuỗi href vào tên công ty.
  const company = [...card.matchAll(/href="\/companies\/[^"]*"[^>]*>([\s\S]{1,200}?)<\/a>/g)]
    .map((match) => clean(match[1]!))
    .find((text) => text.length > 0)

  // Phải kiểm tra "salary" như MỘT TOKEN trong class list, không phải chuỗi
  // con. Card có attribute sign-in-link-class='sign-in-view-salary'; cả
  // /salary/ lẫn /\bsalary\b/ đều khớp vào đó (dấu '-' cũng là ranh giới từ),
  // rồi bóc nhầm nhãn "HOT" ở div kế bên.
  const salaryBlock = [
    ...card.matchAll(/<div class='([^']+)'[^>]*>([\s\S]{0,200}?)<\/div>/g),
  ].find((match) => match[1]!.split(/\s+/).includes("salary"))?.[2]
  const salary = salaryBlock ? clean(salaryBlock) : null

  const tags = [
    ...card.matchAll(/class='stretched-link itag[^']*'[^>]*>([\s\S]{0,80}?)<\/a>/g),
  ]
    .map((match) => clean(match[1]!))
    .filter(Boolean)

  // Địa điểm nằm trong thuộc tính title= bên cạnh icon map-pin. Lấy từ đó đáng
  // tin hơn là dò chuỗi trong toàn bộ thẻ: tên thành phố cũng xuất hiện trong
  // tên công ty và trong mô tả.
  const location = card.match(/map-pin[\s\S]{0,300}?title='([^']+)'/)?.[1]?.trim() ?? null

  const workMode =
    card
      .match(/<div class='text-rich-grey flex-shrink-0'>\s*([^<]{1,40}?)\s*<\/div>/)?.[1]
      ?.trim() ?? null

  // `\s+` chứ KHÔNG phải một dấu cách: nhãn "Posted" và khoảng thời gian nằm ở
  // hai thẻ khác nhau, nên sau khi làm sạch chúng bị ngăn bởi dấu xuống dòng
  // ("Posted\n1 day ago"). Regex cũ đòi đúng một dấu cách nên luôn trượt, và
  // mọi tin ITviec đều vào database với ngày đăng rỗng.
  const postedAt = clean(card).match(/Posted\s+([^|\n]{1,30}?ago)/i)?.[1]?.trim() ?? null

  return {
    id,
    slug,
    title: titleHtml ? clean(titleHtml) : "",
    company: company ?? null,
    companyUrl: card.match(/href="(\/companies\/[^"?]+)/)?.[1]
      ? `${BASE_URL}${card.match(/href="(\/companies\/[^"?]+)/)![1]}`
      : null,
    // Ảnh nằm ở `data-src` chứ không phải `src`: ITviec tải logo trễ qua
    // Stimulus lazyload, nên `src` trống ở HTML gốc. Lọc theo alt "Logo" để
    // không vớ phải ảnh trang trí khác trong thẻ.
    companyLogo:
      card.match(/<img[^>]*alt='[^']*Logo'[^>]*data-src='([^']+)'/i)?.[1] ??
      card.match(/<img[^>]*data-src='([^']+)'/)?.[1] ??
      null,
    location,
    workMode,
    // "Sign in to view salary" không phải mức lương.
    salary: salary && !/sign in|dang nhap|đăng nhập/i.test(salary) ? salary : null,
    postedAt,
    tags,
    url: `${BASE_URL}/it-jobs/${slug}`,
  }
}

export function parseJobCards(html: string): JobCard[] {
  return splitJobCards(html)
    .map(parseJobCard)
    .filter((card): card is JobCard => card !== null && card.title.length > 0)
}

/**
 * Bóc phần mô tả từ trang chi tiết.
 *
 * Mô tả là thứ duy nhất mất thêm một request mới lấy được, nhưng không có nó
 * thì không chấm điểm được - toàn bộ khung đánh giá dựa trên yêu cầu công
 * việc.
 */
export function parseJobDescription(html: string): string | null {
  // Trang chi tiết chia nội dung thành các khối <div class='... paragraph'>
  // nằm trong vùng jobContent: "Top 3 reasons to join us", "Job description",
  // "Your skills and experience", "Why you'll love working here"...
  const scope =
    html.match(/jd-scroll-target='jobContent'[\s\S]*?(?=<footer|<\/main>|$)/)?.[0] ?? html

  const sections = [...scope.matchAll(/<div class='[^']*\bparagraph\b[^']*'[^>]*>([\s\S]*?)<\/div>/g)]
    .map((match) => clean(match[1]!))
    .filter((text) => text.length > 30)

  if (!sections.length) return null
  return sections.join("\n\n")
}

/** Bóc địa điểm từ trang chi tiết (khác cấu trúc với thẻ tìm kiếm). */
export function parseDetailLocation(html: string): string | null {
  return html.match(/map-pin[\s\S]{0,400}?title='([^']+)'/)?.[1]?.trim() ?? null
}

const slugify = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/**
 * Dựng URL trang tìm kiếm.
 *
 * ITviec KHÔNG có bộ lọc thành phố cứng qua URL: đã dò thử, `?city_names[]=`
 * trả về kết quả y hệt khi không lọc. Dạng slug "reactjs-ho-chi-minh" có đổi
 * thứ hạng nhưng vẫn trả về tin ở thành phố khác. Vì vậy địa điểm được dùng ở
 * đây để xếp hạng, còn lọc thật thì làm ở phía client sau khi parse.
 */
export function searchUrl(options: {
  query?: string
  location?: string
  page?: number
}): string {
  const parts = [options.query, options.location].filter(Boolean).map((part) => slugify(part!))
  const path = parts.length ? `/it-jobs/${parts.join("-")}` : "/it-jobs"

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
