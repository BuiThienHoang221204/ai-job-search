import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  isBlockedPage,
  locationFromPosting,
  matchesLocation,
  parseJobCard,
  parseJobCards,
  parseJobDescription,
  parseJobPosting,
  salaryFromPosting,
  searchUrl,
  splitJobCards,
} from "../src/helpers.ts"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

// Trang thật lưu ngày 2026-09-29: tìm "kế toán", và chi tiết tin đầu danh sách.
const searchHtml = fixture("search.html")
const detailHtml = fixture("detail.html")

describe("searchUrl", () => {
  test("từ khoá đi qua tham số keyword - đường robots.txt cho phép", () => {
    expect(searchUrl({ query: "kế toán" })).toBe(
      "https://www.careerlink.vn/vieclam/tim-kiem-viec-lam?keyword=k%E1%BA%BF+to%C3%A1n",
    )
  })

  test("trang 1 không thêm tham số page", () => {
    expect(searchUrl({ query: "java", page: 1 })).not.toContain("page=")
    expect(searchUrl({ query: "java", page: 3 })).toContain("page=3")
  })
})

describe("parseJobCards", () => {
  const cards = parseJobCards(searchHtml)

  test("đọc đủ 50 thẻ của một trang, không trùng id", () => {
    expect(splitJobCards(searchHtml)).toHaveLength(50)
    expect(cards).toHaveLength(50)
    expect(new Set(cards.map((card) => card.id)).size).toBe(50)
  })

  test("thẻ đầu có đủ các trường chính", () => {
    expect(cards[0]).toEqual({
      id: "3636437",
      slug: "nhan-vien-ke-toan-kho-tmdt-10h-19h-tran-phu-ha-dong/3636437",
      title: "Nhân Viên Kế Toán Kho TMĐT (10h - 19h) (Trần Phú - Hà Đông)",
      company: "Thời Trang Adidas - Công Ty Cổ Phần Đầu Tư Thương Mại Phượng Hoàng",
      companyUrl:
        "https://www.careerlink.vn/viec-lam-cua/thoi-trang-adidas-cong-ty-co-phan-dau-tu-thuong-mai-phuong-hoang/96053",
      companyLogo: "https://static.careerlink.vn/image/7fd432e01c2c7af591e664dd6a148cca",
      location: "Hà Nội",
      workMode: null,
      salary: "11 triệu - 15 triệu",
      postedAt: new Date(1790675893 * 1000).toISOString(),
      tags: [],
      url: "https://www.careerlink.vn/tim-viec-lam/nhan-vien-ke-toan-kho-tmdt-10h-19h-tran-phu-ha-dong/3636437",
    })
  })

  test("mọi thẻ đều có chức danh, url và mốc thời gian", () => {
    for (const card of cards) {
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.url).toStartWith("https://www.careerlink.vn/tim-viec-lam/")
      expect(card.postedAt).not.toBeNull()
    }
  })

  test("slug bỏ tham số ?source=site của link gốc", () => {
    for (const card of cards) expect(card.slug).not.toContain("?")
  })

  test("lương thương lượng trả null thay vì chữ", () => {
    const card = parseJobCard(
      searchHtml
        .slice(searchHtml.indexOf("<li class='list-group-item job-item"))
        .replace(/11 triệu - 15 triệu/, "Thương lượng"),
    )
    expect(card?.salary).toBeNull()
  })

  test("trang không có thẻ nào trả mảng rỗng", () => {
    expect(parseJobCards("<html><body>không có gì</body></html>")).toEqual([])
  })
})

describe("trang chi tiết", () => {
  const posting = parseJobPosting(detailHtml)

  test("đọc được JSON-LD JobPosting", () => {
    expect(posting?.title).toBe("Nhân Viên Kế Toán Kho TMĐT (10h - 19h) (Trần Phú - Hà Đông)")
    expect(posting?.datePosted).toBe("2026-09-29")
  })

  test("mô tả ghép cả phần yêu cầu, và giữ TIÊU ĐỀ từng phần", () => {
    const description = parseJobDescription(detailHtml)!
    expect(description).toContain("Mô tả công việc")
    expect(description).toContain("Kinh nghiệm / Kỹ năng chi tiết")
    expect(description).toContain("Thành thạo Excel")
  })

  test("tất cả 22 tin lương null trong fixture đều là Thương lượng/Cạnh tranh, không phải bóc hỏng", () => {
    const cards = splitJobCards(searchHtml)
    const unpaid = cards.filter((card) => parseJobCard(card)?.salary === null)
    expect(unpaid).toHaveLength(22)
    for (const card of unpaid) expect(card).toMatch(/Thương lượng|Cạnh tranh/)
  })

  test("mô tả không lẫn thẻ HTML hay thực thể chưa giải", () => {
    const description = parseJobDescription(detailHtml)!
    expect(description).not.toMatch(/<[a-z/]/i)
    expect(description).not.toMatch(/&(amp|lt|gt|nbsp|#\d+);/)
  })

  test("không có khối mô tả thì lùi về description của JSON-LD", () => {
    const withoutSections = detailHtml
      .replace(/id='section-job-description'/, "id='x'")
      .replace(/id='section-job-skills'/, "id='y'")
    expect(parseJobDescription(withoutSections)).toContain("Lên lệnh điều chuyển hàng hóa")
  })

  test("lương và địa điểm dựng từ JSON-LD", () => {
    expect(salaryFromPosting(posting)).toBe("11 triệu - 15 triệu")
    expect(locationFromPosting(posting)).toBe("Hà Nội")
  })
})

describe("matchesLocation", () => {
  test("so không dấu, tên quốc gia nghĩa là cả nước", () => {
    expect(matchesLocation("Hà Nội", "ha noi")).toBe(true)
    expect(matchesLocation("Hà Nội", "Hồ Chí Minh")).toBe(false)
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
  })
})

describe("chuẩn hoá Unicode", () => {
  test("mọi trường chữ của thẻ tin đều ở dạng NFC - nguồn trả tên công ty ở NFD", () => {
    // Chính fixture này mang tên công ty dạng NFD; không chuẩn hoá thì chống trùng giữa portal hỏng mà không báo gì.
    expect(searchHtml).not.toBe(searchHtml.normalize("NFC"))
    for (const card of parseJobCards(searchHtml)) {
      for (const value of [card.title, card.company, card.location, card.salary]) {
        if (value) expect(value).toBe(value.normalize("NFC"))
      }
    }
  })
})

describe("trang chặn", () => {
  test("nhận ra trang hCaptcha dù nó trả HTTP 200", () => {
    // Trang thật nhận được 2026-09-29 sau một lượt quét 50 tin ở nhịp 3 giây.
    const blocked = fixture("blocked.html")
    expect(isBlockedPage(blocked)).toBe(true)
    expect(parseJobCards(blocked)).toEqual([])
  })

  test("trang tìm kiếm và trang chi tiết bình thường không bị nhận nhầm", () => {
    expect(isBlockedPage(searchHtml)).toBe(false)
    expect(isBlockedPage(detailHtml)).toBe(false)
  })
})
