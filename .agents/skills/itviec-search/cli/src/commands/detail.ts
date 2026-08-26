import {
  BASE_URL,
  htmlFetch,
  parseDetailLocation,
  parseJobCard,
  parseJobDescription,
  splitJobCards,
  type JobDetail,
} from "../helpers.ts"

/**
 * Lấy chi tiết một tin theo slug hoặc URL đầy đủ.
 *
 * Trang chi tiết cũng chứa chính thẻ việc làm đó, nên tái sử dụng được
 * metadata từ đó thay vì bắt người gọi phải truyền lại.
 */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (slugOrUrl.match(/\/it-jobs\/([^/?#]+)/)?.[1] ?? "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "")

  if (!slug) return null

  const html = await htmlFetch(`${BASE_URL}/it-jobs/${slug}`)
  if (!html) return null

  const description = parseJobDescription(html)
  const card = splitJobCards(html).map(parseJobCard).find((item) => item?.slug === slug)

  if (card) return { ...card, description }

  // Trang chi tiết không nhúng lại thẻ tìm kiếm, nên phải bóc riêng từng
  // trường. Tên công ty suy từ slug của tin: ITviec đặt slug theo dạng
  // "<chuc-danh>-<ten-cong-ty>-<so>", và trang có nhiều link /companies/ khác
  // (quảng cáo, gợi ý) nên không thể lấy link đầu tiên.
  const companySlug = html.match(
    /data-search--job-selection-job-slug-value='[^']*'|href="\/companies\/([a-z0-9-]+)[^"]*"[^>]*class='[^']*company/,
  )?.[1]

  return {
    id: html.match(/data-job-key='([^']+)'/)?.[1] ?? slug,
    slug,
    title: html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "",
    company: companySlug ? companySlug.replace(/-/g, " ") : null,
    companyUrl: companySlug ? `${BASE_URL}/companies/${companySlug}` : null,
    location: parseDetailLocation(html),
    workMode: null,
    salary: null,
    postedAt: null,
    tags: [],
    url: `${BASE_URL}/it-jobs/${slug}`,
    description,
    companyLogo: null,
  }
}
