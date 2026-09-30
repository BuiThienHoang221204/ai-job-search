import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  describePosting,
  industryFor,
  industryUrl,
  isBlockedPage,
  isExpiredPage,
  keywordCandidates,
  keywordUrl,
  locationFromPosting,
  matchesLocation,
  parseJobCard,
  parseJobCards,
  parseJobPosting,
  rankByQuery,
  relevantTo,
  salaryFromPosting,
  salaryOf,
} from "../src/helpers.ts"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

// Trang thật lưu 2026-09-29/30, đã bỏ <script>/<svg>/<style> - phần CLI không đọc.
const categoryHtml = fixture("category-ke-toan.html")
const keywordHtml = fixture("keyword-ke-toan-tong-hop.html")
const detailHtml = fixture("detail.html")

describe("URL - chỉ đi đường robots.txt cho phép", () => {
  test("trang từ khoá và trang ngành, phân trang ngành bằng ?p=", () => {
    expect(keywordUrl("ke-toan-tong-hop")).toBe("https://vn.joboko.com/tim-viec-lam-ke-toan-tong-hop")
    const accounting = industryFor("kế toán")!
    expect(industryUrl(accounting)).toBe("https://vn.joboko.com/viec-lam-nganh-ke-toan-kiem-toan-xni32")
    expect(industryUrl(accounting, 2)).toBe("https://vn.joboko.com/viec-lam-nganh-ke-toan-kiem-toan-xni32?p=2")
  })

  test("KHÔNG BAO GIỜ dựng /jobs? hay /viec-lam-theo-khoa? - robots.txt chặn", () => {
    for (const query of ["kế toán tổng hợp", "frontend developer", "điều dưỡng"]) {
      for (const slug of keywordCandidates(query)) expect(keywordUrl(slug)).not.toMatch(/\/jobs\?|viec-lam-theo-khoa\?/)
      const industry = industryFor(query)
      if (industry) expect(industryUrl(industry, 3)).not.toMatch(/\/jobs\?|viec-lam-theo-khoa\?/)
    }
  })

  test("thử tối đa hai cụm từ khoá: cả cụm, rồi hai từ đầu; một từ thì không thử", () => {
    expect(keywordCandidates("kế toán tổng hợp")).toEqual(["ke-toan-tong-hop", "ke-toan"])
    expect(keywordCandidates("Kế toán trưởng sản xuất")).toEqual(["ke-toan-truong-san-xuat", "ke-toan"])
    expect(keywordCandidates("điều dưỡng")).toEqual(["dieu-duong"])
    expect(keywordCandidates("java")).toEqual([])
  })
})

describe("industryFor - ánh xạ từ khoá sang ngành", () => {
  test.each([
    ["kế toán tổng hợp", "ke-toan-kiem-toan"],
    ["frontend developer", "it-phan-mem"],
    ["điều dưỡng", "y-te-duoc"],
    ["giáo viên tiếng Anh", "giao-duc-dao-tao"],
    ["nhân viên kinh doanh", "nhan-vien-kinh-doanh"],
    ["xuất nhập khẩu", "xuat-nhap-khau"],
  ])("%s -> %s", (query, slug) => {
    expect(industryFor(query)?.slug).toBe(slug)
  })

  test("cụm đứng trước thắng, so theo ranh giới từ", () => {
    expect(industryFor("kế toán logistics")?.slug).toBe("ke-toan-kiem-toan")
    expect(industryFor("an toàn lao động")?.slug).toBe("an-toan-lao-dong")
  })

  test("không khớp gì thì null - không có ngành mặc định", () => {
    expect(industryFor("xyz không có thật")).toBeNull()
  })
})

describe("parseJobCards", () => {
  test("trang ngành: 10 thẻ, trang từ khoá: 20 thẻ, không trùng id", () => {
    const category = parseJobCards(categoryHtml)
    const keyword = parseJobCards(keywordHtml)
    expect(category).toHaveLength(10)
    expect(keyword).toHaveLength(20)
    expect(new Set(keyword.map((card) => card.id)).size).toBe(20)
  })

  test("thẻ đầu trang ngành có đủ các trường chính, KHÔNG có ngày đăng", () => {
    expect(parseJobCards(categoryHtml)[0]).toEqual({
      id: "6656919",
      slug: "viec-lam-chuyen-vien-tai-chinh-xvi6656919",
      title: "Chuyên Viên Tài Chính - Thu Nhập 18-25M - Hà Nội",
      company: "TỔNG CÔNG TY CHÈ VIỆT NAM - CTCP",
      companyUrl: null,
      companyLogo: "https://u2-vn.joboko.com/ComLogo/2026/7/260729094326_tong-cong-ty-che-viet-nam-ctcp.jpg",
      location: "Hà Nội, Phú Thọ, Sơn La",
      workMode: null,
      salary: "18 triệu - 25 triệu VND",
      // Ngày trên thẻ (26/10/2026) là HẠN NỘP; lấy nó làm ngày đăng là sai.
      postedAt: null,
      tags: [],
      url: "https://vn.joboko.com/viec-lam-chuyen-vien-tai-chinh-xvi6656919",
    })
  })

  test("mọi chữ ở dạng NFC, trang rác trả rỗng", () => {
    for (const card of parseJobCards(keywordHtml)) {
      for (const value of [card.title, card.company, card.location]) {
        if (value) expect(value).toBe(value.normalize("NFC"))
      }
    }
    expect(parseJobCards("<html>không có gì</html>")).toEqual([])
    expect(parseJobCard("<div>rác</div>")).toBeNull()
  })
})

describe("relevantTo + rankByQuery", () => {
  test("trang ngành Kế toán thật: bỏ tin lạc đề, giữ tin đúng ngành", () => {
    const accounting = industryFor("kế toán")!
    const cards = parseJobCards(categoryHtml)
    const kept = cards.filter((card) => relevantTo(card, "kế toán", accounting.phrases))
    expect(kept.length).toBeGreaterThanOrEqual(8)
    expect(kept.length).toBeLessThan(cards.length)
  })

  test("từ khoá tiếng Anh vẫn giữ tin chức danh tiếng Việt, nhờ cụm của NGÀNH", () => {
    const card = { ...parseJobCards(categoryHtml)[1]!, title: "Kế Toán Tổng Hợp" }
    expect(relevantTo(card, "accountant", industryFor("accountant")!.phrases)).toBe(true)
  })

  test("tin khớp nhiều chữ của từ khoá lên đầu", () => {
    const ranked = rankByQuery(parseJobCards(categoryHtml), "kế toán trưởng")
    expect(ranked[0]!.title.toLowerCase()).toContain("kế toán trưởng")
  })
})

describe("trang chi tiết", () => {
  const posting = parseJobPosting(detailHtml)

  test("đọc JSON-LD: ngày đăng thật, lương (dạng CHUỖI), tỉnh", () => {
    expect(posting?.datePosted).toBe("2026-09-29")
    expect(salaryFromPosting(posting)).toBe("14 - 18 triệu VND")
    expect(locationFromPosting(posting)).toBe("Hà Nội")
  })

  test("mô tả giữ 'Mô tả công việc' + 'Yêu cầu', bỏ quyền lợi/thông tin chung/nơi làm việc", () => {
    const description = describePosting(posting)!
    expect(description).toStartWith("Mô tả công việc\n")
    expect(description).toContain("\n\nYêu cầu\n")
    expect(description).not.toContain("Quyền lợi")
    expect(description).not.toContain("Nơi làm việc")
    expect(description).not.toMatch(/<[a-z!/]/i)
  })

  test("không tách được khối nào thì trả cả mô tả thay vì mất trắng", () => {
    expect(describePosting({ description: "<p>Chỉ có một đoạn văn dài hơn mười ký tự.</p>" })).toBe(
      "Chỉ có một đoạn văn dài hơn mười ký tự.",
    )
  })
})

describe("salaryOf, matchesLocation, trang chặn", () => {
  test("lương không phải con số trả null", () => {
    expect(salaryOf("Thỏa thuận")).toBeNull()
    expect(salaryOf("10 triệu - 15 triệu VND")).toBe("10 triệu - 15 triệu VND")
  })

  test("hồ sơ gửi 'Ho Chi Minh' khớp tin ghi 'TP.HCM' hay 'Hồ Chí Minh'", () => {
    expect(matchesLocation("TP.HCM", "Ho Chi Minh")).toBe(true)
    expect(matchesLocation("Hồ Chí Minh, Bình Dương", "Ho Chi Minh")).toBe(true)
    expect(matchesLocation("Hà Nội, Phú Thọ", "Ho Chi Minh")).toBe(false)
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
  })

  test("nhận ra captcha/Cloudflare, không nhận nhầm trang thật", () => {
    expect(isBlockedPage("<title>Just a moment...</title>")).toBe(true)
    for (const html of [categoryHtml, keywordHtml, detailHtml]) expect(isBlockedPage(html)).toBe(false)
  })
})

describe("trang chặn - bẫy widget reCAPTCHA", () => {
  test("trang thật CÓ widget g-recaptcha (form góp ý) mà KHÔNG bị coi là trang chặn", () => {
    // Nhận nhầm ở đây thì CLI báo BLOCKED mọi lượt và backend tạm ngừng JobOKO mãi mãi.
    expect(categoryHtml).toContain('class="g-recaptcha"')
    expect(isBlockedPage(categoryHtml)).toBe(false)
    expect(isBlockedPage(keywordHtml)).toBe(false)
  })

  test("trang chỉ có thử thách, không có tin nào, mới là trang chặn", () => {
    expect(isBlockedPage('<form><div class="g-recaptcha"></div></form>')).toBe(true)
  })
})

describe("tin hết hạn", () => {
  test("trang thật của tin hết hạn: 200 nhưng không có JSON-LD - nhận ra là HẾT HẠN, không phải không tồn tại", () => {
    const expired = fixture("detail-expired.html")
    expect(parseJobPosting(expired)).toBeNull()
    expect(isExpiredPage(expired)).toBe(true)
    expect(isBlockedPage(expired)).toBe(false)
  })

  test("tin còn hạn không bị nhận nhầm là hết hạn", () => {
    expect(isExpiredPage(detailHtml)).toBe(false)
  })
})
