import {
  apiFetch,
  matchesLocation,
  MAX_PAGES,
  newestFirst,
  PAGE_GAP_MS,
  PAGE_SIZE,
  toJobCards,
  writeError,
  type ApiJob,
  type JobCard,
} from "../helpers.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
}

/** Trang 1 đi hết kết quả của từ khoá (tối đa MAX_PAGES) rồi xếp tin mới nhất lên đầu; trang sau trả rỗng. */
export async function search(options: SearchOptions): Promise<JobCard[]> {
  if (!options.query) {
    writeError("timviec.ai cần --query: không quét trang \"mọi việc làm\"", "NO_QUERY")
    return []
  }
  if ((options.page ?? 1) > 1) return []

  const all: ApiJob[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await new Promise((resolve) => setTimeout(resolve, PAGE_GAP_MS))
    const response = await apiFetch<ApiJob[]>("/jobs/filter-job-post", {
      searchTerm: options.query,
      offset: String(page * PAGE_SIZE),
      limit: String(PAGE_SIZE),
    })
    if (!response || response.data.length === 0) break
    all.push(...response.data)
    if (all.length >= (response.total ?? 0)) break
  }

  let jobs = newestFirst(toJobCards(all))
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }
  return options.limit ? jobs.slice(0, options.limit) : jobs
}
