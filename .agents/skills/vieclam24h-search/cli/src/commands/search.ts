import {
  BASE_URL,
  categoryUrl,
  htmlFetch,
  matchesLocation,
  occupationFor,
  parseJobCards,
  relevantTo,
  textFetch,
  writeError,
  type JobCard,
} from "../helpers.ts"
import { loadSubPages, subPageFor } from "../sub-occupations.ts"

/** Sort tin MỚI NHẤT trước (ngày đăng ISO giảm dần, tin không ngày xuống cuối). Lượt quét
 * hệ thống cần tin mới, không cần relevance theo từ khoá (ngành đã chọn đúng qua category). */
const byNewest = (cards: JobCard[]): JobCard[] =>
  [...cards].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))

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
    jobs = byNewest(parseJobCards(html))
  } else if (occupation) {
    if (options.page && options.page > 1) return []
    const html = await htmlFetch(categoryUrl(occupation))
    jobs = byNewest(
      parseJobCards(html).filter((card) => relevantTo(card, query, occupation.phrases)),
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
