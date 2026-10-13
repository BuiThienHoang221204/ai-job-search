import { describe, expect, test } from "bun:test"
import {
  BlockedError,
  categoriesOf,
  decodeEntities,
  errorForStatus,
  flightBuffer,
  isBlockedPage,
  matchesLocation,
  parseDetail,
  parseSearchPage,
  resultJobs,
  resultTotal,
  salaryOf,
  searchUrl,
} from "../src/helpers.ts"

/** Trang thật nhận được 2026-10-13 từ máy chủ Oracle, nén gzip vì payload RSC dày ~1,2MB. */
const fixture = async (name: string): Promise<string> =>
  new TextDecoder().decode(
    Bun.gunzipSync(new Uint8Array(await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).arrayBuffer())),
  )

const searchHtml = await fixture("search-ke-toan.html.gz")
const detailHtml = await fixture("detail.html.gz")
const DETAIL_SLUG = "nhan-vien-ke-toan-tong-hop-cong-ty-co-phan-ad-tek-2135256"

describe("searchUrl", () => {
  test("tìm theo từ khoá thật, trang 1 không mang tham số page", () => {
    expect(searchUrl({ query: "Kế toán" })).toBe("https://topdev.vn/jobs/search?keyword=K%E1%BA%BF+to%C3%A1n")
  })

  test("trang sau mang page", () => {
    expect(searchUrl({ query: "java developer", page: 2 })).toBe(
      "https://topdev.vn/jobs/search?keyword=java+developer&page=2",
    )
  })

  test("không có từ khoá thì không có URL - không quét trang 'mọi việc làm'", () => {
    expect(searchUrl({})).toBeNull()
    expect(searchUrl({ query: "   " })).toBeNull()
  })
})

describe("parseSearchPage", () => {
  const jobs = parseSearchPage(searchHtml)

  test("đúng 15 kết quả của trang, theo meta", () => {
    expect(jobs).toHaveLength(15)
    expect(resultTotal(flightBuffer(searchHtml))).toBe(137)
  })

  test("KHÔNG lẫn tin của khối 'việc làm hot' - trang nhúng 25 đối tượng tin cho 15 kết quả", () => {
    // 2137421 "Cobol Developer" chỉ nằm trong khối gợi ý của trang, không phải kết quả "Kế toán".
    expect(jobs.map((job) => job.id)).not.toContain("2137421")
    expect(resultJobs(flightBuffer(searchHtml))).toHaveLength(15)
  })

  test("thẻ đầu tiên đủ trường theo hợp đồng của backend", () => {
    expect(jobs[0]).toMatchObject({
      id: "2137024",
      slug: "chief-accountant-cong-ty-co-phan-vcj-warehouse-2137024",
      title: "Chief Accountant",
      company: "CÔNG TY CỔ PHẦN VCJ WAREHOUSE",
      location: "Hà Nội",
      salary: "15.000.000 VND to 23.000.000 VND",
      postedAt: "07-10-2026",
      tags: ["Accounting", "Chief Accountant"],
      url: "https://topdev.vn/viec-lam/chief-accountant-cong-ty-co-phan-vcj-warehouse-2137024",
    })
  })

  test("mô tả giải được tham chiếu '$xx' cho MỌI tin - backend khỏi gọi detail", () => {
    for (const job of jobs) {
      expect(job.description).toStartWith("Mô tả công việc\n")
      expect(job.description).toContain("\n\nYêu cầu ứng viên\n")
      expect(job.description).not.toMatch(/\$[0-9a-f]+\b|\r|&[a-z]+;/)
    }
  })

  test("lương 'Negotiable' là null, không phải một con số", () => {
    expect(jobs.find((job) => job.id === "2133619")!.salary).toBeNull()
  })

  test("trang không có payload thì trả rỗng chứ không nổ", () => {
    expect(parseSearchPage("<html></html>")).toEqual([])
  })
})

describe("parseDetail", () => {
  const job = parseDetail(detailHtml, DETAIL_SLUG)!

  test("đọc tin từ JSON-LD", () => {
    expect(job).toMatchObject({
      id: "2135256",
      title: "Nhân viên Kế toán Tổng hợp",
      company: "CÔNG TY CỔ PHẦN AD.TEK",
      location: "Hồ Chí Minh",
      postedAt: "05-10-2026",
      tags: ["Kế toán", "Kế toán tổng hợp"],
    })
  })

  test("mô tả lấy từ payload RSC - JSON-LD chỉ có tiêu đề các mục, THIẾU nội dung", () => {
    expect(job.description).toStartWith("Mô tả công việc\n")
    expect(job.description).toContain("hóa đơn GTGT")
  })

  /// `industry` của JSON-LD là "Information Technology" cho cả tin kế toán này - dùng nó là xếp mọi tin TopDev vào IT.
  test("KHÔNG lấy industry của JSON-LD làm nhãn ngành (tin này mã 14, quá rộng)", () => {
    expect(detailHtml).toContain('"industry":"Information Technology"')
    expect(job.categories).toEqual([])
  })
})

describe("categoriesOf - nhãn ngành từ job_category_id", () => {
  test("mã rõ nghĩa thành nhãn để backend đổi sang mã ngành", () => {
    expect(categoriesOf({ job_category_id: 1 })).toEqual(["Công nghệ thông tin"])
    expect(categoriesOf({ job_category_id: 27 })).toEqual(["Hành chính - Nhân sự"])
    expect(categoriesOf({ job_category_id: 50 })).toEqual(["Giáo dục - Đào tạo"])
    expect(categoriesOf({ job_category_id: 61 })).toEqual(["Thiết kế"])
  })

  /// Mã 14 gồm kế toán + marketing + chăm sóc khách hàng + ngân hàng; mã 33 gồm cơ khí + xuất nhập khẩu + xây dựng.
  test("mã QUÁ RỘNG không thành nhãn - để tiêu đề quyết định", () => {
    expect(categoriesOf({ job_category_id: 14 })).toEqual([])
    expect(categoriesOf({ job_category_id: 33 })).toEqual([])
    expect(categoriesOf({ job_category_id: null })).toEqual([])
    expect(categoriesOf({})).toEqual([])
  })

  test("thẻ tìm kiếm mang nhãn; tin kế toán (mã 14) thì rỗng", () => {
    for (const job of parseSearchPage(searchHtml)) expect(job.categories).toEqual([])
  })
})

describe("decodeEntities", () => {
  test("giải chữ có dấu mã hoá kiểu &iacute; - JSON-LD của TopDev dùng dạng này", () => {
    expect(decodeEntities("Vị tr&iacute; &bull; Nh&acirc;n vi&ecirc;n")).toBe("Vị trí • Nhân viên")
  })

  test("&amp;lt; chỉ giải một lần", () => {
    expect(decodeEntities("&amp;lt;p&amp;gt;")).toBe("&lt;p&gt;")
  })
})

describe("trang chặn", () => {
  test("trang thử thách Cloudflare là trang chặn", () => {
    expect(isBlockedPage("<html><title>Just a moment...</title><script src=\"https://challenges.cloudflare.com/x\"></script>")).toBe(true)
  })

  test("trang thật nhúng script Cloudflare vẫn KHÔNG bị coi là trang chặn", () => {
    const widget = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'
    expect(isBlockedPage(searchHtml + widget)).toBe(false)
    expect(isBlockedPage(detailHtml + widget)).toBe(false)
  })

  test("403 là BLOCKED ngay để backend bật cầu dao", () => {
    expect(errorForStatus(403)).toBeInstanceOf(BlockedError)
    expect(errorForStatus(500)).not.toBeInstanceOf(BlockedError)
  })
})

describe("salaryOf và matchesLocation", () => {
  test("thương lượng / negotiable là null", () => {
    expect(salaryOf("Thương lượng")).toBeNull()
    expect(salaryOf("Negotiable")).toBeNull()
    expect(salaryOf("Up to 45.000.000 VND")).toBe("Up to 45.000.000 VND")
  })

  test("TP.HCM viết kiểu nào cũng khớp; tên quốc gia là cả nước", () => {
    expect(matchesLocation("Quận Phú Nhuận, Hồ Chí Minh", "HCM")).toBe(true)
    expect(matchesLocation("Hà Nội", "Ho Chi Minh")).toBe(false)
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
  })
})
