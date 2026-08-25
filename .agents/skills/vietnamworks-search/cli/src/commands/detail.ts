import {
  BASE_URL,
  apiSearch,
  descriptionFromDetailHtml,
  fetchHtml,
  idFromSlug,
  jobFromDetailHtml,
  queryFromSlug,
  slugFromUrl,
  toJobDetail,
  type ApiJob,
  type JobDetail,
} from "../helpers.ts"

/**
 * Lấy chi tiết một tin theo slug ("<alias>-<id>-jv") hoặc URL đầy đủ.
 *
 * KHÔNG có endpoint chi tiết công khai: đã dò `/job/v1.0/<id>` và
 * `/jobs/v1.0/<id>` (403) lẫn `/job-search/v1.0/jobs/<id>` (404). Cũng không
 * lọc được theo jobId - `filter: [{field:"jobId"}]` trả 400.
 *
 * Nên cách chạy được là tìm bằng chính các từ trong alias rồi đối chiếu jobId.
 * Có đối chiếu là bắt buộc: truy vấn theo từ khoá có thể trả về tin khác gần
 * giống, và trả nhầm tin còn tệ hơn trả null.
 *
 * Metadata lấy từ API, MÔ TẢ lấy từ HTML trang chi tiết: bản mô tả trong API bị
 * cắt ở vài trăm ký tự. Trang chi tiết hỏng thì vẫn trả bản API, vì một mô tả
 * cụt còn dùng được còn null thì làm tin bị bỏ luôn.
 */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? slugFromUrl(slugOrUrl)
    : slugOrUrl.replace(/^\/+|\/+$/g, "")

  if (!slug) return null

  const wantedId = idFromSlug(slug)
  if (!wantedId) return null

  const url = `${BASE_URL}/${slug}`
  const html = await fetchHtml(url).catch(() => null)
  const match = await apiJob(slug, wantedId).catch(() => null)

  if (match) {
    const fromApi = toJobDetail(match)
    const description = html ? descriptionFromDetailHtml(html, match) : null
    if (fromApi) return description ? { ...fromApi, description } : fromApi
  }

  return html ? jobFromDetailHtml(html, url) : null
}

/** Tin trong API tìm kiếm, đối chiếu bằng jobId để không trả nhầm tin gần giống. */
async function apiJob(slug: string, wantedId: string): Promise<ApiJob | null> {
  const response = await apiSearch({
    query: queryFromSlug(slug),
    page: 0,
    hitsPerPage: 20,
    filter: [],
    userId: 0,
  })

  return (
    (response.data ?? []).find(
      (job) => job.jobId !== undefined && String(job.jobId) === wantedId,
    ) ?? null
  )
}
