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

const AGE_UNITS: Record<string, number> = {
  phut: 1,
  gio: 60,
  ngay: 1440,
  tuan: 10080,
  thang: 43200,
  nam: 525600,
}

/** "X ngày/tuần/giờ trước" → số phút trước (để sort). Không đọc được = cũ nhất (vô cực). */
function ageMinutes(postedAt: string | null): number {
  if (!postedAt) return Number.POSITIVE_INFINITY
  const text = postedAt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const match = text.match(/(\d+)\s*(phut|gio|ngay|tuan|thang|nam)/)
  return match ? Number(match[1]) * (AGE_UNITS[match[2]] ?? Infinity) : Infinity
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

  // Trang listing chèn tin tài trợ nên không sắp đúng theo ngày; sort lại tin MỚI NHẤT trước.
  jobs = jobs.sort((a, b) => ageMinutes(a.postedAt) - ageMinutes(b.postedAt))

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
