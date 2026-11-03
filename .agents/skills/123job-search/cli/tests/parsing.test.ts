import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BlockedError,
  decodeEntities,
  errorForStatus,
  isBlockedPage,
  matchesLocation,
  parseDetail,
  parseJobCards,
  salaryOf,
  searchUrl,
} from "../src/helpers.ts"

/** Trang thật nhận được 2026-11-03 sau khi 123job dựng lại giao diện (Laravel Livewire, Tailwind). */
const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

const searchHtml = fixture("search-ke-toan.html")
const detailHtml = fixture("detail.html")

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

  test("mã tin là hash cuối slug (giao diện mới không còn data-id số)", () => {
    for (const card of cards) expect(card.id).toMatch(/^[A-Za-z0-9]{6,}$/)
  })

  test("thẻ đủ trường theo hợp đồng của backend", () => {
    expect(cards.find((card) => card.id === "vrzBG5ywr0")).toMatchObject({
      slug: "ke-toan-thue-vrzBG5ywr0",
      title: "Kế Toán Thuế",
      company: "Công Ty Tnhh Tài Chính Kế Toán Vintax",
      location: "Hà Nội",
      salary: "9 triệu",
      postedAt: "24 giờ trước",
      url: "https://123job.vn/viec-lam/ke-toan-thue-vrzBG5ywr0",
    })
  })

  test("lương '__' (chưa công bố trên thẻ) là null", () => {
    expect(cards.find((card) => card.id === "JDaj4kwX9G")!.salary).toBeNull()
  })

  test("thẻ KHÔNG mang mô tả - backend phải gọi detail", () => {
    for (const card of cards) expect(card).not.toHaveProperty("description")
  })

  test("trang không có thẻ thì trả rỗng chứ không nổ", () => {
    expect(parseJobCards("<html></html>")).toEqual([])
  })
})

describe("parseDetail", () => {
  const job = parseDetail(detailHtml, "ke-toan-tong-hop-JDaj4kwX9G")!

  test("mã tin là hash cuối slug, trùng một thẻ của trang tìm kiếm", () => {
    expect(job.id).toBe("JDaj4kwX9G")
    expect(parseJobCards(searchHtml).some((card) => card.id === job.id)).toBe(true)
  })

  test("tiêu đề bỏ nhãn 'Hết hạn', thông tin công ty từ mục cuối trang", () => {
    expect(job).toMatchObject({
      title: "Kế Toán Tổng Hợp",
      company: "Công ty CP Liên Doanh Cảng Quốc tế Mỹ Thủy",
      postedAt: "2 tháng trước",
    })
  })

  test("mô tả lấy từ block 'Mô tả công việc', GIỮ tiêu đề và DỪNG trước mục Quyền lợi", () => {
    expect(job.description).toStartWith("Mô tả công việc\n")
    expect(job.description).toContain("TÓM TẮT MỤC ĐÍCH CÔNG VIỆC")
    expect(job.description).not.toContain("Quyền lợi")
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
  test("'__' / đang cập nhật / thỏa thuận là null", () => {
    expect(salaryOf("__")).toBeNull()
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
