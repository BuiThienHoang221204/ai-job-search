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
  salaryOf,
  searchUrl,
  skillsFromPosting,
  slugify,
  splitJobCards,
} from "../src/helpers.ts"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

// Trang thật lưu 2026-09-29 ("kế toán" và tin đầu danh sách), đã bỏ <script>/<svg> - phần CLI không đọc.
const searchHtml = fixture("search-ke-toan.html")
const detailHtml = fixture("detail.html")

describe("searchUrl", () => {
  test("từ khoá thành slug không dấu, đúng dạng URL tìm kiếm của trang", () => {
    expect(searchUrl({ query: "Kế toán" })).toBe("https://careerviet.vn/viec-lam/ke-toan-k-vi.html")
    expect(searchUrl({ query: "frontend developer" })).toBe(
      "https://careerviet.vn/viec-lam/frontend-developer-k-vi.html",
    )
  })

  test("trang N chèn -trang-N, trang 1 thì không", () => {
    expect(searchUrl({ query: "kế toán", page: 1 })).toBe("https://careerviet.vn/viec-lam/ke-toan-k-vi.html")
    expect(searchUrl({ query: "kế toán", page: 2 })).toBe(
      "https://careerviet.vn/viec-lam/ke-toan-k-trang-2-vi.html",
    )
  })

  test("không có từ khoá thì không có URL - không quét 'mọi việc làm'", () => {
    expect(searchUrl({})).toBeNull()
    expect(searchUrl({ query: "   " })).toBeNull()
    expect(slugify("C++ / .NET")).toBe("c-net")
  })
})

describe("parseJobCards", () => {
  const cards = parseJobCards(searchHtml)

  test("đọc đủ 50 thẻ, không trùng id, và tất cả đúng từ khoá", () => {
    expect(splitJobCards(searchHtml)).toHaveLength(50)
    expect(cards).toHaveLength(50)
    expect(new Set(cards.map((card) => card.id)).size).toBe(50)
    for (const card of cards) expect(card.title.toLowerCase()).toContain("kế toán")
  })

  test("thẻ đầu có đủ các trường chính", () => {
    expect(cards[0]).toEqual({
      id: "35C83573",
      slug: "ke-toan.35C83573",
      title: "Kế Toán",
      company: "Công ty Cổ phần Homeflow",
      companyUrl: "https://careerviet.vn/vi/nha-tuyen-dung/cong-ty-co-phan-homeflow.35AA3450.html",
      companyLogo: "https://images.careerviet.vn/employer_folders/lot0/346960/Logo.jpg",
      location: "Hồ Chí Minh",
      workMode: null,
      salary: "Trên 16 Triệu VND",
      postedAt: new Date("2026-09-13T00:00:00+07:00").toISOString(),
      tags: [],
      url: "https://careerviet.vn/vi/tim-viec-lam/ke-toan.35C83573.html",
    })
  })

  test("mọi thẻ có URL chi tiết, mốc cập nhật và chữ ở dạng NFC", () => {
    for (const card of cards) {
      expect(card.url).toMatch(/^https:\/\/careerviet\.vn\/vi\/tim-viec-lam\/.+\.[0-9A-F]+\.html$/)
      expect(card.postedAt).not.toBeNull()
      for (const value of [card.title, card.company, card.location]) {
        if (value) expect(value).toBe(value.normalize("NFC"))
      }
    }
  })

  test("trang không có thẻ nào trả rỗng", () => {
    expect(parseJobCards("<html><body>không có gì</body></html>")).toEqual([])
    expect(parseJobCard("<div>rác</div>")).toBeNull()
  })
})

describe("salaryOf", () => {
  test("bỏ tiền tố 'Lương:', lương không phải con số thì null", () => {
    expect(salaryOf("Lương: Trên 16 Triệu VND")).toBe("Trên 16 Triệu VND")
    expect(salaryOf("Lương: Cạnh tranh")).toBeNull()
    expect(salaryOf("Lương: Thỏa thuận")).toBeNull()
    expect(salaryOf(null)).toBeNull()
  })
})

describe("trang chi tiết", () => {
  const posting = parseJobPosting(detailHtml)

  test("đọc JSON-LD JobPosting: ngày đăng thật, lương, tỉnh", () => {
    expect(posting?.title).toBe("Kế Toán")
    expect(posting?.datePosted).toBe("2026-09-13T22:01:07.540Z")
    expect(salaryFromPosting(posting)).toBe("Từ 16 triệu")
    // addressRegion của tin này là "Quận 7" - lấy nhầm trường đó là ra tên quận thay vì tỉnh.
    expect(locationFromPosting(posting)).toBe("Hồ Chí Minh")
  })

  test("kỹ năng portal tự gắn thành tags, bỏ trùng", () => {
    const skills = skillsFromPosting(posting)
    expect(skills).toContain("Kế toán tổng hợp")
    expect(new Set(skills.map((skill) => skill.toLowerCase())).size).toBe(skills.length)
  })

  test("mô tả ghép 'Mô tả Công việc' + 'Yêu Cầu Công Việc', giữ tiêu đề, bỏ phúc lợi/địa điểm", () => {
    const description = parseJobDescription(detailHtml)!
    expect(description).toStartWith("Mô tả Công việc\n")
    expect(description).toContain("\n\nYêu Cầu Công Việc\n")
    expect(description).toContain("Thành thạo MISA")
    expect(description).not.toContain("Địa điểm làm việc")
    expect(description).not.toMatch(/<[a-z!/]/i)
    expect(description).not.toMatch(/&(amp|lt|gt|nbsp|#\d+);/)
  })

  test("không có khối mô tả thì lùi về description của JSON-LD", () => {
    const withoutSections = detailHtml.replaceAll('<h2 class="detail-title">', '<h2 class="x">')
    expect(parseJobDescription(withoutSections)).toContain("Mục tiêu vị trí")
  })
})

describe("matchesLocation", () => {
  test("hồ sơ gửi 'Ho Chi Minh' khớp tin ghi 'Hồ Chí Minh' hay 'TP.HCM'", () => {
    expect(matchesLocation("Hồ Chí Minh", "Ho Chi Minh")).toBe(true)
    expect(matchesLocation("TP.HCM", "Ho Chi Minh")).toBe(true)
    expect(matchesLocation("Hà Nội", "Ho Chi Minh")).toBe(false)
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
  })
})

describe("trang chặn", () => {
  test("nhận ra captcha/Cloudflare, không nhận nhầm trang thật", () => {
    expect(isBlockedPage("<html><title>Just a moment...</title></html>")).toBe(true)
    expect(isBlockedPage('<div class="g-recaptcha"></div>')).toBe(true)
    expect(isBlockedPage(searchHtml)).toBe(false)
    expect(isBlockedPage(detailHtml)).toBe(false)
  })
})

describe("trang chặn - bẫy widget reCAPTCHA", () => {
  test("trang có tin kèm widget reCAPTCHA của form góp ý KHÔNG phải trang chặn", () => {
    expect(isBlockedPage(searchHtml + '<div class="g-recaptcha"></div>')).toBe(false)
    expect(isBlockedPage(detailHtml + '<div class="g-recaptcha"></div>')).toBe(false)
  })
})
