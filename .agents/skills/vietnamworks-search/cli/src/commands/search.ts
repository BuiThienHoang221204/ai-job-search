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

const AGE_UNITS: Record<string, number> = {
  phut: 1,
  gio: 60,
  ngay: 1440,
  tuan: 10080,
  thang: 43200,
  nam: 525600,
}

/** "X phút/giờ/ngày trước" → số phút (sort mới nhất trước). Không đọc được = cũ nhất. */
function ageMinutes(postedAt: string | null): number {
  if (!postedAt) return Number.POSITIVE_INFINITY
  const text = postedAt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const match = text.match(/(\d+)\s*(phut|gio|ngay|tuan|thang|nam)/)
  return match ? Number(match[1]) * (AGE_UNITS[match[2]] ?? Infinity) : Infinity
}

/**
 * Trả về JobDetail chứ không phải JobCard, nhưng `description` chỉ là bản TÓM
 * TẮT: API cắt jobDescription và jobRequirement ở vài trăm ký tự rồi thêm dấu
 * "...". Muốn mô tả đầy đủ thì phải gọi `detail`.
 *
 * Vẫn trả mô tả cụt thay vì bỏ trống, để phía gọi có cái dùng khi `detail`
 * không tìm lại được tin (tra theo id không có, phải tìm bằng từ khoá alias).
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

  // Keyword search trả theo ĐỘ LIÊN QUAN (tin cũ lẫn vào) — sort mới nhất trước
  // để lượt theo-nhãn (listing:false) lấy đúng tin mới. Sort ổn định nên query
  // rỗng (API đã date-sorted) giữ nguyên thứ tự khi cùng mốc thời gian.
  jobs = jobs.sort((a, b) => ageMinutes(a.postedAt) - ageMinutes(b.postedAt))

  return options.limit ? jobs.slice(0, options.limit) : jobs
}
