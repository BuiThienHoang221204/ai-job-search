import {
  BASE_URL,
  categoryUrl,
  htmlFetch,
  matchesLocation,
  occupationFor,
  parseJobCards,
  rankByQuery,
  relevantTo,
  textFetch,
  writeError,
  type JobCard,
} from "../helpers.ts"
import { loadSubPages, subPageFor } from "../sub-occupations.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
  /** Nhận để đồng bộ giao diện với các portal khác; Vieclam24h không cho lọc hình thức làm việc. */
  remote?: "remote" | "hybrid" | "onsite"
}

/**
 * Từ khoá -> trang NGÀNH CON khớp nhất (chính xác, 20 tin riêng) -> không có thì
 * trang NGÀNH CHA (lọc bỏ tin lạc đề) -> không có nữa thì rỗng và nói ra trên
 * stderr. Không có ngành mặc định.
 */
export async function search(options: SearchOptions): Promise<JobCard[]> {
  const query = options.query?.trim() ?? ""
  if (!query) {
    writeError("Vieclam24h cần --query để chọn ngành nghề", "NO_CATEGORY")
    return []
  }

  const occupation = occupationFor(query)
  const subPath = subPageFor(query, await loadSubPages(textFetch), occupation?.slug)

  let jobs: JobCard[]
  if (subPath) {
    // Phân trang phía server không đổi nội dung (xem sub-occupations.ts), nên chỉ trang 1 có nghĩa.
    if (options.page && options.page > 1) return []
    const html = await htmlFetch(`${BASE_URL}${subPath}`)
    jobs = rankByQuery(parseJobCards(html), query)
  } else if (occupation) {
    if (options.page && options.page > 1) return []
    const html = await htmlFetch(categoryUrl(occupation))
    jobs = rankByQuery(
      parseJobCards(html).filter((card) => relevantTo(card, query, occupation.phrases)),
      query,
    )
  } else {
    writeError(
      `không ánh xạ được "${query}" sang ngành nghề nào của Vieclam24h; portal này không tìm được theo từ khoá tự do`,
      "NO_CATEGORY",
    )
    return []
  }

  // Lọc tỉnh ở phía client: trang ngành không nhận tham số tỉnh trong phạm vi đã kiểm.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
