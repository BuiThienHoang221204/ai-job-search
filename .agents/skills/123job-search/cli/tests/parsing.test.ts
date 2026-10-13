import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BlockedError,
  categoriesFromPosting,
  decodeEntities,
  errorForStatus,
  isBlockedPage,
  matchesLocation,
  parseDetail,
  parseJobCards,
  parseJobPosting,
  salaryOf,
  searchUrl,
} from "../src/helpers.ts"

/** Trang thật nhận được 2026-10-13 từ máy chủ Oracle. */
const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

const searchHtml = fixture("search-ke-toan.html")
const detailHtml = fixture("detail.html")
const baHtml = fixture("detail-business-analyst.html")

describe("searchUrl", () => {
  test("tìm theo từ khoá thật, trang 1 không mang tham số page", () => {
    expect(searchUrl({ query: "kế toán" })).toBe("https://123job.vn/tuyen-dung?q=k%E1%BA%BF+to%C3%A1n")
  })

  test("trang sau mang page", () => {
    expect(searchUrl({ query: "java developer", page: 2 })).toBe("https://123job.vn/tuyen-dung?q=java+developer&page=2")
  })

  test("không có từ khoá thì không có URL - không quét trang 'mọi việc làm'", () => {
    expect(searchUrl({})).toBeNull()
  })
})

describe("parseJobCards", () => {
  const cards = parseJobCards(searchHtml)

  test("đủ 30 thẻ của trang, không trùng", () => {
    expect(cards).toHaveLength(30)
    expect(new Set(cards.map((card) => card.id)).size).toBe(30)
  })

  test("mã tin là data-id SỐ của thẻ, không phải data-id nhỏ của các phần tử khác", () => {
    for (const card of cards) expect(card.id).toMatch(/^\d{6,}$/)
  })

  test("thẻ đủ trường theo hợp đồng của backend", () => {
    expect(cards.find((card) => card.id === "5636350")).toMatchObject({
      slug: "tuyen-dung-ke-toan-tong-hop-j9KQoK1AqA",
      title: "Tuyển dụng kế toán tổng hợp",
      company: "Công ty tnhh mtv xăng dầu dầu khí duyên hải",
      location: "Hải Phòng",
      salary: "15 triệu",
      postedAt: "2026-10-13",
      url: "https://123job.vn/viec-lam/tuyen-dung-ke-toan-tong-hop-j9KQoK1AqA",
    })
  })

  test("lương 'Đang cập nhật' là null", () => {
    expect(cards.find((card) => card.id === "5584695")!.salary).toBeNull()
  })

  test("thẻ KHÔNG mang mô tả - đoạn trên thẻ bị cắt, backend phải gọi detail", () => {
    for (const card of cards) expect(card).not.toHaveProperty("description")
  })

  test("trang không có thẻ thì trả rỗng chứ không nổ", () => {
    expect(parseJobCards("<html></html>")).toEqual([])
  })
})

describe("parseDetail", () => {
  const job = parseDetail(detailHtml, "ke-toan-thue-3q27l5wpDM")!

  test("mã tin trùng data-id của thẻ tìm kiếm", () => {
    expect(job.id).toBe("5613141")
    expect(parseJobCards(searchHtml).some((card) => card.id === job.id)).toBe(true)
  })

  test("đọc JSON-LD dù thẻ script không có ngoặc thuộc tính (HTML nén)", () => {
    expect(detailHtml).toContain("<script type=application/ld+json>")
    expect(job).toMatchObject({
      title: "Kế toán thuế",
      company: "Công Ty TNHH Thiết Bị Tự Động Hóa Kim Khí Thăng Long",
      location: "Hà Nội",
      postedAt: "2026-10-13",
    })
  })

  test("mô tả lấy từ HTML, CÓ phần yêu cầu - JSON-LD của tin này THIẾU hẳn phần đó", () => {
    expect(parseJobPosting(detailHtml)!.description).not.toMatch(/Misa/)
    expect(job.description).toStartWith("Mô tả công việc\n")
    expect(job.description).toContain("\n\nYêu cầu công việc\n")
    expect(job.description).toContain("Misa")
    expect(job.description).not.toContain("Quyền lợi")
  })

  test("nhãn ngành là industry của nhà tuyển dụng", () => {
    expect(job.categories).toEqual(["Kế toán - Kiểm toán"])
  })

  /// Nhãn có thể lệch nghề ("Phát triển thị trường" cho một tin Business Analyst) - backend để tiêu đề rõ nghề thắng nhãn.
  test("nhãn được giữ nguyên văn, kể cả khi lệch với tiêu đề", () => {
    expect(categoriesFromPosting(parseJobPosting(baHtml))).toEqual(["Phát triển thị trường"])
  })
})

describe("decodeEntities", () => {
  test("giải chữ có dấu kiểu &iacute; và &amp;lt; chỉ một lần", () => {
    expect(decodeEntities("Vị tr&iacute; &amp;lt;p&amp;gt;")).toBe("Vị trí &lt;p&gt;")
  })
})

describe("trang chặn", () => {
  test("trang thử thách không có thẻ tin là trang chặn", () => {
    expect(isBlockedPage("<html><title>Attention Required! | Cloudflare</title></html>")).toBe(true)
  })

  test("trang thật nhúng widget reCAPTCHA vẫn KHÔNG bị coi là trang chặn", () => {
    const widget = '<div class="g-recaptcha"></div>'
    expect(isBlockedPage(searchHtml + widget)).toBe(false)
    expect(isBlockedPage(detailHtml + widget)).toBe(false)
  })

  test("403 là BLOCKED ngay để backend bật cầu dao", () => {
    expect(errorForStatus(403)).toBeInstanceOf(BlockedError)
    expect(errorForStatus(500)).not.toBeInstanceOf(BlockedError)
  })
})

describe("salaryOf và matchesLocation", () => {
  test("đang cập nhật / thỏa thuận là null", () => {
    expect(salaryOf("Đang cập nhật")).toBeNull()
    expect(salaryOf("Thỏa thuận")).toBeNull()
    expect(salaryOf("15 triệu")).toBe("15 triệu")
  })

  test("TP.HCM viết kiểu nào cũng khớp; tên quốc gia là cả nước", () => {
    expect(matchesLocation("Hồ Chí Minh", "HCM")).toBe(true)
    expect(matchesLocation("Trảng Bom, Đồng Nai", "Đồng Nai")).toBe(true)
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
  })
})
