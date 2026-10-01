import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  categoryUrl,
  clean,
  isBlockedPage,
  matchesLocation,
  occupationFor,
  parseDetail,
  parseJobCards,
  rankByQuery,
  relevantTo,
  salaryText,
} from "../src/helpers.ts"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

// Dữ liệu thật lưu ngày 2026-09-29, rút gọn còn đúng phần __NEXT_DATA__ mà CLI đọc.
const categoryHtml = fixture("category-ke-toan.html")
const detailHtml = fixture("detail.html")

describe("occupationFor - ánh xạ từ khoá sang ngành", () => {
  test.each([
    ["kế toán tổng hợp", "ke-toan"],
    ["Kế toán trưởng", "ke-toan"],
    ["ke toan kho", "ke-toan"],
    ["frontend developer", "it-phan-mem"],
    ["Lập trình viên ReactJS", "it-phan-mem"],
    ["giáo viên tiếng Anh", "giao-duc-dao-tao"],
    ["nhân viên kinh doanh", "ban-hang-kinh-doanh"],
    ["điều dưỡng", "y-te-cham-soc-suc-khoe"],
    ["xuất nhập khẩu", "xuat-nhap-khau"],
  ])("%s -> %s", (query, slug) => {
    expect(occupationFor(query)?.slug).toBe(slug)
  })

  test("cụm đứng TRƯỚC thắng: 'kế toán logistics' là việc kế toán, không phải kho vận", () => {
    expect(occupationFor("kế toán logistics")?.slug).toBe("ke-toan")
    expect(occupationFor("kế toán trưởng sản xuất")?.slug).toBe("ke-toan")
  })

  test("so theo ranh giới từ: 'kế toán' KHÔNG khớp 'an toàn lao động'", () => {
    expect(occupationFor("an toàn lao động")?.slug).toBe("an-toan-lao-dong")
    expect(occupationFor("kế toán")?.slug).not.toBe("an-toan-lao-dong")
  })

  test("không khớp gì thì null - không có ngành mặc định", () => {
    expect(occupationFor("xyz không có thật")).toBeNull()
    expect(occupationFor("")).toBeNull()
  })

  test("URL trang ngành, và page=1 không thêm tham số", () => {
    const ketoan = occupationFor("kế toán")!
    expect(categoryUrl(ketoan)).toBe("https://vieclam24h.vn/viec-lam-ke-toan-o17.html")
    expect(categoryUrl(ketoan, 1)).not.toContain("?")
    expect(categoryUrl(ketoan, 2)).toBe("https://vieclam24h.vn/viec-lam-ke-toan-o17.html?page=2")
  })

  test("KHÔNG BAO GIỜ dựng URL có tham số q - robots.txt chặn /*?q", () => {
    for (const query of ["kế toán", "developer", "giáo viên"]) {
      expect(categoryUrl(occupationFor(query)!, 3)).not.toMatch(/[?&]q=/)
    }
  })
})

describe("parseJobCards", () => {
  const cards = parseJobCards(categoryHtml)

  test("đọc đủ 20 tin của trang ngành từ __NEXT_DATA__", () => {
    expect(cards).toHaveLength(20)
    expect(new Set(cards.map((card) => card.id)).size).toBe(20)
  })

  test("tin đầu có đủ các trường chính, URL khớp đúng link trên trang thật", () => {
    expect(cards[0]).toMatchObject({
      id: "200945707",
      title: "Kế Toán Đối Soát – Hoạt Toán Sàn Thương Mại Điện Tử",
      location: "TP.HCM",
      url: "https://vieclam24h.vn/ke-toan/ke-toan-doi-soat-hoat-toan-san-thuong-mai-dien-tu-c17p122id200945707.html",
      slug: "ke-toan/ke-toan-doi-soat-hoat-toan-san-thuong-mai-dien-tu-c17p122id200945707",
      companyUrl: null,
    })
    expect(cards[0]!.tags).toContain("Kế toán & hạch toán")
  })

  test("ngày đăng là approved_at, KHÔNG phải refresh_at (mốc làm mới trả phí)", () => {
    const raw = JSON.parse(
      categoryHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)![1]!,
    ).props.initialProps.pageProps.jobsResponse.items[0]
    expect(raw.refresh_at).not.toBe(raw.approved_at)
    expect(cards[0]!.postedAt).toBe(new Date(raw.approved_at * 1000).toISOString())
  })

  test("mọi chữ ở dạng NFC", () => {
    for (const card of cards) {
      for (const value of [card.title, card.company, card.location]) {
        if (value) expect(value).toBe(value.normalize("NFC"))
      }
    }
  })

  test("trang không có __NEXT_DATA__ thì rỗng, không ném", () => {
    expect(parseJobCards("<html><body>không có gì</body></html>")).toEqual([])
  })
})

describe("rankByQuery", () => {
  test("tin có chữ của từ khoá trong chức danh lên đầu, giữ thứ tự gốc khi hoà", () => {
    const cards = parseJobCards(categoryHtml)
    const ranked = rankByQuery(cards, "kế toán tổng hợp")
    expect(ranked).toHaveLength(cards.length)
    expect(ranked[0]!.title.toLowerCase()).toContain("tổng hợp")
    const firstMiss = ranked.findIndex((card) => !card.title.toLowerCase().includes("kế toán"))
    const lastHit = ranked.findLastIndex((card) => card.title.toLowerCase().includes("kế toán"))
    if (firstMiss !== -1) expect(firstMiss).toBeGreaterThan(lastHit)
  })
})

describe("trang chi tiết", () => {
  const job = parseDetail(detailHtml)!

  test("đọc tin từ __NEXT_DATA__ và dựng lại đúng URL", () => {
    expect(job.id).toBe("200941565")
    expect(job.title).toBe("Nhân Viên Thủ Kho")
    expect(job.url).toBe(
      "https://vieclam24h.vn/thu-mua-kho-van-chuoi-cung-ung/nhan-vien-thu-kho-c14p73id200941565.html",
    )
    expect(job.salary).toBe("10 triệu - 12 triệu")
    expect(job.location).toBe("Hà Nội")
  })

  test("mô tả ghép các khối và GIỮ tiêu đề, gồm cả phần yêu cầu", () => {
    expect(job.description).toContain("Mô tả công việc\n")
    expect(job.description).toContain("Yêu cầu khác\n")
    expect(job.description).toContain("Sử dụng tốt tin học văn phòng")
  })

  test("mô tả không lẫn thẻ, comment HTML hay thực thể chưa giải", () => {
    expect(job.description).not.toMatch(/<[a-z!/]/i)
    expect(job.description).not.toMatch(/&(amp|lt|gt|nbsp|#\d+);/)
  })
})

describe("salaryText", () => {
  test("0 là Thoả thuận, trả null", () => {
    expect(salaryText(0, 0)).toBeNull()
    expect(salaryText(12_000_000, 25_000_000)).toBe("12 triệu - 25 triệu")
    expect(salaryText(15_000_000, 0)).toBe("Từ 15 triệu")
  })
})

describe("matchesLocation", () => {
  test("hồ sơ gửi 'Ho Chi Minh' phải khớp tin ghi 'TP.HCM'", () => {
    expect(matchesLocation("TP.HCM", "Ho Chi Minh")).toBe(true)
    expect(matchesLocation("TP.HCM", "Hồ Chí Minh")).toBe(true)
    expect(matchesLocation("TP.HCM", "Hà Nội")).toBe(false)
    expect(matchesLocation("Hà Nội", "Vietnam")).toBe(true)
  })
})

describe("trang chặn", () => {
  test("thiếu __NEXT_DATA__ hoặc có captcha thì là trang chặn", () => {
    expect(isBlockedPage("<html><title>Just a moment...</title></html>")).toBe(true)
    expect(isBlockedPage("<html><body>hcaptcha.com</body></html>")).toBe(true)
    expect(isBlockedPage(categoryHtml)).toBe(false)
    expect(isBlockedPage(detailHtml)).toBe(false)
  })
})

describe("clean", () => {
  test("bỏ comment StartFragment mà trình soạn thảo của portal chèn vào", () => {
    expect(clean("<!--StartFragment--><ul><li>Excel</li></ul><!--EndFragment-->")).toBe("- Excel")
  })
})

describe("relevantTo - bỏ tin lạc đề của trang ngành", () => {
  const card = (title: string) => ({ ...parseJobCards(categoryHtml)[0]!, title })

  test("'frontend developer' giữ tin lập trình, bỏ 'Giáo viên Tin học' (ca thật 2026-09-29)", () => {
    const it = occupationFor("frontend developer")!
    expect(relevantTo(card("Senior Full - Stack Developer"), "frontend developer", it.phrases)).toBe(true)
    expect(relevantTo(card("Lập Trình Viên PHP"), "frontend developer", it.phrases)).toBe(true)
    expect(relevantTo(card("Giáo Viên Tin Học (Có Bằng CNTT)"), "frontend developer", it.phrases)).toBe(false)
    expect(relevantTo(card("Chuyên Viên Đào Tạo Nội Bộ"), "frontend developer", it.phrases)).toBe(false)
  })

  test("từ khoá tiếng Anh vẫn giữ tin chức danh tiếng Việt, nhờ cụm của NGÀNH", () => {
    const accounting = occupationFor("accountant")!
    expect(relevantTo(card("Kế Toán Tổng Hợp"), "accountant", accounting.phrases)).toBe(true)
  })

  test("trang ngành Kế toán thật: tin không có chữ kế toán/kiểm toán nào bị bỏ", () => {
    const accounting = occupationFor("kế toán tổng hợp")!
    const kept = parseJobCards(categoryHtml).filter((c) =>
      relevantTo(c, "kế toán tổng hợp", accounting.phrases),
    )
    expect(kept.length).toBeGreaterThan(10)
    expect(kept.length).toBeLessThan(20)
    for (const c of kept) expect(c.title.toLowerCase()).toMatch(/kế toán|accountant|accounting/)
  })
})

describe("trang chặn - bẫy widget reCAPTCHA", () => {
  test("trang thật có widget reCAPTCHA của form góp ý KHÔNG bị coi là trang chặn", () => {
    expect(isBlockedPage(categoryHtml + '<div class="g-recaptcha"></div>')).toBe(false)
  })
})
