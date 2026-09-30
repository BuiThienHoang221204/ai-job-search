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
  /** Nhận để đồng bộ giao diện với các portal khác; thẻ CareerLink không ghi hình thức làm việc nên không lọc được. */
  remote?: "remote" | "hybrid" | "onsite"
}

export async function search(options: SearchOptions): Promise<JobCard[]> {
  const html = await htmlFetch(searchUrl({ query: options.query, page: options.page }))
  if (!html) return []

  let jobs = parseJobCards(html)

  // Lọc thành phố ở phía client: bộ lọc tỉnh của CareerLink đi qua đường dẫn
  // riêng (/tim-viec-lam-tai/<tinh>/<ma>) với mã không công bố.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
