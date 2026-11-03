import {
  htmlFetch,
  matchesLocation,
  parseJobCards,
  searchUrl,
  writeError,
  type JobCard,
} from "../helpers.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
  /** Nhận để đồng bộ giao diện với các portal khác; thẻ CareerViet không ghi hình thức làm việc. */
  remote?: "remote" | "hybrid" | "onsite"
}

/** Sort tin MỚI NHẤT trước (postedAt ISO giảm dần, tin không ngày xuống cuối). Trang keyword
 * trả theo độ liên quan nên tin mới bị chìm; lượt quét hệ thống cần tin mới. */
const byNewest = (cards: JobCard[]): JobCard[] =>
  [...cards].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))

export async function search(options: SearchOptions): Promise<JobCard[]> {
  const url = searchUrl({ query: options.query, page: options.page })
  if (!url) {
    writeError("CareerViet cần --query: không có trang \"mọi việc làm\" nào đáng quét", "NO_QUERY")
    return []
  }

  const html = await htmlFetch(url)
  if (!html) return []

  let jobs = parseJobCards(html)

  // Lọc tỉnh ở phía client: bộ lọc tỉnh của CareerViet đi qua mã số trong URL không công bố.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? byNewest(jobs).slice(0, options.limit) : byNewest(jobs)
}
