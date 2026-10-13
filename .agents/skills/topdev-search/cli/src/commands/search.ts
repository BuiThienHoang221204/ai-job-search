import {
  htmlFetch,
  matchesLocation,
  parseSearchPage,
  searchUrl,
  writeError,
  type JobCard,
} from "../helpers.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
  /** Nhận để đồng bộ giao diện với các portal khác; chỉ tin ghi "Remote" mới được gắn `workMode`. */
  remote?: "remote" | "hybrid" | "onsite"
}

export async function search(options: SearchOptions): Promise<JobCard[]> {
  const url = searchUrl({ query: options.query, page: options.page })
  if (!url) {
    writeError("TopDev cần --query: không có trang \"mọi việc làm\" nào đáng quét", "NO_QUERY")
    return []
  }

  const html = await htmlFetch(url)
  if (!html) return []

  let jobs = parseSearchPage(html)

  // Bộ lọc tỉnh của TopDev đi qua mã `region_ids` không công bố bảng tra, nên lọc ở phía client.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
