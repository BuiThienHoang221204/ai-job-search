import {
  apiSearch,
  matchesLocation,
  toJobDetail,
  type JobDetail,
} from "../helpers.ts"

export interface SearchOptions {
  query?: string
  location?: string
  page?: number
  limit?: number
  /** Nhận để đồng bộ giao diện với các portal khác; API không phân biệt được
   *  remote/hybrid/onsite ở mức dùng được nên cờ này không lọc gì. */
  remote?: "remote" | "hybrid" | "onsite"
}

/** API trả tối đa 50 tin một trang; xin nhiều hơn thì nó im lặng cắt bớt. */
const MAX_HITS_PER_PAGE = 50

/**
 * Trả về JobDetail chứ không phải JobCard: API đã kèm sẵn jobDescription và
 * jobRequirement, nên gọi thêm `detail` cho từng tin vừa thừa vừa mong manh
 * (không có endpoint tra theo id, phải tìm lại bằng từ khoá alias và có thể
 * không thấy). Phía gọi thấy `description` khác null thì bỏ hẳn bước detail.
 */
export async function search(options: SearchOptions): Promise<JobDetail[]> {
  const response = await apiSearch({
    query: options.query ?? "",
    // API đánh số trang từ 0, còn CLI nhận từ 1 cho đồng bộ với các portal
    // khác. Quên trừ 1 ở đây thì `--page 1` sẽ trả về trang thứ hai.
    page: Math.max(0, (options.page ?? 1) - 1),
    hitsPerPage: Math.min(options.limit ?? 20, MAX_HITS_PER_PAGE),
    filter: [],
    userId: 0,
  })

  let jobs = (response.data ?? [])
    .map(toJobDetail)
    .filter((job): job is JobDetail => job !== null)

  // Lọc thành phố ở phía client: tham số `filter` của API không có tài liệu và
  // dạng lọc theo thành phố chưa dò ra được.
  if (options.location) {
    jobs = jobs.filter((job) => matchesLocation(job.location, options.location!))
  }

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
