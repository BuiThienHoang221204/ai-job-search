import {
  htmlFetch,
  industryFor,
  industryUrl,
  keywordCandidates,
  keywordUrl,
  matchesLocation,
  parseJobCards,
  rankByQuery,
  relevantTo,
  writeError,
  type JobCard,
} from "../helpers.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
  /** Nhận để đồng bộ giao diện với các portal khác; thẻ JobOKO không ghi hình thức làm việc. */
  remote?: "remote" | "hybrid" | "onsite"
}

/** Nghỉ giữa hai request trong CÙNG một lượt CLI - nhịp của backend chỉ canh giữa các lượt. */
const INNER_PAUSE_MS = 3_000

/**
 * Từ khoá -> trang từ khoá biên tập sẵn (tối đa hai lần thử) -> không có thì trang
 * ngành -> không có nữa thì rỗng và nói ra trên stderr. Không có ngành mặc định.
 */
export async function search(options: SearchOptions): Promise<JobCard[]> {
  const query = options.query?.trim() ?? ""
  if (!query) {
    writeError("JobOKO cần --query để chọn trang từ khoá hoặc ngành", "NO_CATEGORY")
    return []
  }

  const industry = industryFor(query)
  const phrases = industry?.phrases ?? []
  let jobs: JobCard[] | null = null

  // Trang từ khoá chỉ có trang 1 trong phạm vi đã kiểm; lật trang thì đi thẳng trang ngành.
  if (!options.page || options.page === 1) {
    for (const [index, slug] of keywordCandidates(query).entries()) {
      if (index > 0) await new Promise((done) => setTimeout(done, INNER_PAUSE_MS))
      const html = await htmlFetch(keywordUrl(slug))
      if (!html) continue
      jobs = parseJobCards(html).filter((card) => relevantTo(card, query, phrases))
      break
    }
  }

  if (jobs === null) {
    if (!industry) {
      writeError(
        `không có trang từ khoá hay ngành nào của JobOKO khớp "${query}"; portal này không tìm được theo từ khoá tự do`,
        "NO_CATEGORY",
      )
      return []
    }
    const html = await htmlFetch(industryUrl(industry, options.page))
    jobs = parseJobCards(html).filter((card) => relevantTo(card, query, phrases))
  }

  jobs = rankByQuery(jobs, query)

  // Lọc tỉnh ở phía client: trang ngành không nhận tham số tỉnh trong phạm vi đã kiểm.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
