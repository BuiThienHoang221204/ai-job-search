import {
  apiSearch,
  idFromSlug,
  queryFromSlug,
  slugFromUrl,
  toJobDetail,
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
 */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? slugFromUrl(slugOrUrl)
    : slugOrUrl.replace(/^\/+|\/+$/g, "")

  if (!slug) return null

  const wantedId = idFromSlug(slug)
  if (!wantedId) return null

  const response = await apiSearch({
    query: queryFromSlug(slug),
    page: 0,
    hitsPerPage: 20,
    filter: [],
    userId: 0,
  })

  const match = (response.data ?? []).find(
    (job) => job.jobId !== undefined && String(job.jobId) === wantedId,
  )
  if (!match) return null

  return toJobDetail(match)
}
