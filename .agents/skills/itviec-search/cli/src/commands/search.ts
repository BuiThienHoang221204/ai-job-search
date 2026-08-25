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
  /** Lọc theo hình thức làm việc, đối chiếu với trường workMode của thẻ. */
  remote?: "remote" | "hybrid" | "onsite"
}

const MODE_PATTERNS: Record<string, RegExp> = {
  remote: /remote|tu xa/i,
  hybrid: /hybrid/i,
  onsite: /at office|van phong/i,
}

export async function search(options: SearchOptions): Promise<JobCard[]> {
  const html = await htmlFetch(
    searchUrl({ query: options.query, location: options.location, page: options.page }),
  )
  if (!html) return []

  let jobs = parseJobCards(html)

  // ITviec không lọc thành phố phía server, nên phải lọc ở đây - nếu không,
  // tìm việc ở TP.HCM vẫn trả về đầy tin Hà Nội.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  if (options.remote) {
    const pattern = MODE_PATTERNS[options.remote]!
    jobs = jobs.filter((job) => job.workMode && pattern.test(job.workMode))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
