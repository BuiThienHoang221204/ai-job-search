import {
  htmlFetch,
  matchesLocation,
  parseJobCards,
  searchUrl,
  type JobCard,
} from "../helpers.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
  /** Có nhận cờ này để đồng bộ giao diện với các portal khác, nhưng TopCV
   *  không ghi hình thức làm việc trên thẻ tìm kiếm nên nó không lọc được gì. */
  remote?: "remote" | "hybrid" | "onsite"
}

export async function search(options: SearchOptions): Promise<JobCard[]> {
  const html = await htmlFetch(
    searchUrl({ query: options.query, page: options.page }),
  )
  if (!html) return []

  let jobs = parseJobCards(html)

  // TopCV lọc thành phố bằng cityIds[] với mã số không công bố, nên lọc ở đây
  // - nếu không, tìm việc ở TP.HCM vẫn trả về đầy tin Hà Nội.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
