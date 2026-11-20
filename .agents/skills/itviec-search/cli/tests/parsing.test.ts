import { describe, expect, test } from "bun:test"
import {
  BlockedError,
  decodeEntities,
  errorForStatus,
  isBlockedPage,
  matchesLocation,
  parseJobCards,
  parseJobExpertise,
  searchUrl,
  splitJobCards,
} from "../src/helpers.ts"

const fixture = await Bun.file(
  new URL("./fixtures/search-cards.html", import.meta.url),
).text()

describe("splitJobCards", () => {
  test("tách đúng số thẻ", () => {
    expect(splitJobCards(fixture)).toHaveLength(3)
  })

  test("trả mảng rỗng khi không có thẻ nào", () => {
    expect(splitJobCards("<html><body>khong co gi</body></html>")).toHaveLength(0)
  })
})

describe("parseJobCards", () => {
  const jobs = parseJobCards(fixture)

  test("bóc được cả 3 thẻ", () => {
    expect(jobs).toHaveLength(3)
  })

  test("id là UUID ổn định, không phải slug", () => {
    for (const job of jobs) {
      expect(job.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
      expect(job.id).not.toBe(job.slug)
    }
  })

  test("tên công ty không dính chuỗi href", () => {
    // Lỗi thật đã gặp: regex bóc cả đoạn khớp thay vì nhóm 1, khiến company
    // thành 'href="/companies/fpt-software...">FPT Software'.
    for (const job of jobs) {
      expect(job.company ?? "").not.toContain("href")
      expect(job.company ?? "").not.toContain("/companies/")
    }
  })

  test("nhãn HOT không bị nhầm thành mức lương", () => {
    for (const job of jobs) {
      expect(job.salary).not.toBe("HOT")
    }
  })

  test("lương ẩn sau đăng nhập được chuẩn hóa thành null", () => {
    for (const job of jobs) {
      if (job.salary) expect(job.salary.toLowerCase()).not.toContain("sign in")
    }
  })

  test("địa điểm lấy từ thuộc tính title", () => {
    expect(jobs.every((job) => job.location && job.location.length > 0)).toBe(true)
  })

  test("url trỏ đúng trang tin", () => {
    for (const job of jobs) {
      expect(job.url).toBe(`https://itviec.com/it-jobs/${job.slug}`)
    }
  })
})

describe("searchUrl", () => {
  test("ghép từ khóa và địa điểm thành slug không dấu", () => {
    expect(searchUrl({ query: "ReactJS", location: "Hồ Chí Minh" })).toBe(
      "https://itviec.com/it-jobs/reactjs-ho-chi-minh",
    )
  })

  test("không có tham số thì về trang gốc", () => {
    expect(searchUrl({})).toBe("https://itviec.com/it-jobs")
  })

  test("trang 1 không thêm tham số page", () => {
    expect(searchUrl({ query: "java", page: 1 })).not.toContain("page")
    expect(searchUrl({ query: "java", page: 3 })).toContain("page=3")
  })
})

describe("matchesLocation", () => {
  test("lọc theo tên quốc gia nghĩa là KHÔNG lọc", () => {
    // Lỗi đã gặp thật: lượt quét của hệ thống truyền --location Vietnam và loại
    // sạch kết quả ở cả ba portal Việt Nam, vì "ha-noi" không chứa "vietnam".
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
    expect(matchesLocation("Hồ Chí Minh", "Việt Nam")).toBe(true)
    expect(matchesLocation("Đà Nẵng", "VN")).toBe(true)
  })

  test("chuỗi rỗng cũng nghĩa là không lọc", () => {
    expect(matchesLocation("Hà Nội", "")).toBe(true)
  })

  test("khớp tin đa thành phố", () => {
    expect(matchesLocation("Ho Chi Minh - Ha Noi", "Ho Chi Minh")).toBe(true)
    expect(matchesLocation("Ho Chi Minh - Ha Noi", "Da Nang")).toBe(false)
  })

  test("bỏ qua dấu tiếng Việt", () => {
    expect(matchesLocation("Hồ Chí Minh", "Ho Chi Minh")).toBe(true)
  })

  test("địa điểm null không khớp", () => {
    expect(matchesLocation(null, "Ha Noi")).toBe(false)
  })
})

describe("decodeEntities", () => {
  test("giải mã thực thể có tên và số", () => {
    expect(decodeEntities("R&amp;D &#39;test&#39; &nbsp;x")).toBe("R&D 'test'  x")
  })
})

const detail = await Bun.file(new URL("./fixtures/detail.html", import.meta.url)).text()

describe("parseJobExpertise", () => {
  test("lấy nghề trong Job Expertise", () => {
    expect(parseJobExpertise(detail)).toEqual(["Fullstack Developer"])
  })

  test("KHÔNG lấy Job Domain - đó là lĩnh vực của công ty", () => {
    expect(parseJobExpertise(detail)).not.toContain("Software Products and Web Services")
  })

  test("trang không có mục đó thì trả mảng rỗng", () => {
    expect(parseJobExpertise("<html></html>")).toEqual([])
  })
})

/** Thân trang thử thách THẬT của Cloudflare, lấy từ máy chủ ngày 2026-11-20 (ITviec bật Cloudflare 11-18). */
const CHALLENGE_PAGE =
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
  '<meta http-equiv="content-security-policy" content="script-src https://challenges.cloudflare.com">' +
  "</head><body><script>(function(){window._cf_chl_opt = {cFPWv: 'b'}})()</script></body></html>"

describe("trang chặn của Cloudflare", () => {
  test("trang thử thách thật là trang chặn", () => {
    expect(isBlockedPage(CHALLENGE_PAGE)).toBe(true)
  })

  test("trang chi tiết THẬT nhúng Turnstile vẫn KHÔNG bị coi là trang chặn", () => {
    expect(detail).toContain("challenges.cloudflare.com")
    expect(isBlockedPage(detail)).toBe(false)
  })

  test("trang danh sách thật không bị coi là trang chặn", () => {
    expect(isBlockedPage(fixture)).toBe(false)
  })
})

describe("errorForStatus", () => {
  test("403 là BLOCKED ngay để backend bật cầu dao, không bắn tiếp vào portal đang chặn", () => {
    expect(errorForStatus(403)).toBeInstanceOf(BlockedError)
  })

  test("mã khác là lỗi thường", () => {
    expect(errorForStatus(500)).not.toBeInstanceOf(BlockedError)
    expect(errorForStatus(410)).not.toBeInstanceOf(BlockedError)
  })
})
