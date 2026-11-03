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

/** Khoá sắp xếp theo ngày: nhận ISO/`YYYY-MM-DD` và `DD-MM-YYYY`; định dạng lạ trả "" để
 * GIỮ NGUYÊN thứ tự (an toàn khi chưa verify được format của `published.date`). */
const sortKey = (postedAt: string | null): string => {
  if (!postedAt) return ""
  const iso = postedAt.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`
  const dmy = postedAt.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (dmy) return `${dmy[3]}${dmy[2]}${dmy[1]}`
  return ""
}

/** Tin MỚI NHẤT trước. Trang keyword trả theo relevance; lượt quét hệ thống cần tin mới. */
const byNewest = (cards: JobCard[]): JobCard[] =>
  [...cards].sort((a, b) => sortKey(b.postedAt).localeCompare(sortKey(a.postedAt)))

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

  jobs = byNewest(jobs)
  return options.limit ? jobs.slice(0, options.limit) : jobs
}
