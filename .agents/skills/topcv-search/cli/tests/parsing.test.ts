import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  decodeEntities,
  matchesLocation,
  parseCardLocation,
  parseDetailTitle,
  parseJobCard,
  parseJobCards,
  parseJobDescription,
  searchUrl,
  splitJobCards,
} from "../src/helpers.ts"

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

const searchHtml = fixture("search-cards.html")
const detailHtml = fixture("detail.html")

describe("splitJobCards", () => {
  test("cắt được đúng số thẻ trong fixture", () => {
    expect(splitJobCards(searchHtml)).toHaveLength(3)
  })

  test("trang không có thẻ nào trả mảng rỗng", () => {
    expect(splitJobCards("<html><body>khong co gi</body></html>")).toHaveLength(0)
  })

  test("mỗi mảnh cắt ra chỉ thuộc về MỘT tin", () => {
    // data-job-id xuất hiện nhiều lần trong một thẻ (div thẻ, nút bỏ qua, nút
    // ứng tuyển, link) nhưng đều cùng một giá trị. Điều cần đảm bảo là mảnh cắt
    // không lấn sang tin kế tiếp, chứ không phải đếm số lần xuất hiện.
    for (const card of splitJobCards(searchHtml)) {
      const ids = new Set([...card.matchAll(/data-job-id="(\d+)"/g)].map((m) => m[1]))
      expect(ids.size).toBe(1)
    }
  })
})

describe("parseJobCard", () => {
  const cards = parseJobCards(searchHtml)

  test("parse được cả 3 thẻ", () => {
    expect(cards).toHaveLength(3)
  })

  test("id là số nguyên, dùng làm externalId", () => {
    for (const card of cards) expect(card.id).toMatch(/^\d+$/)
  })

  test("tiêu đề không rỗng và không lẫn thẻ HTML", () => {
    for (const card of cards) {
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.title).not.toContain("<")
    }
  })

  test("tên công ty không lẫn href", () => {
    // Lỗi này đã xảy ra thật ở parser ITviec: bắt cả đoạn khớp thay vì nhóm 1.
    for (const card of cards) {
      if (card.company) {
        expect(card.company).not.toContain("href")
        expect(card.company).not.toContain("<")
      }
    }
  })

  test("url dựng lại được và không mang query", () => {
    // u_sr_id đổi mỗi lần tải trang; giữ lại thì cùng một tin trông như hai tin.
    for (const card of cards) {
      expect(card.url).toStartWith("https://www.topcv.vn/viec-lam/")
      expect(card.url).toEndWith(".html")
      expect(card.url).not.toContain("?")
    }
  })

  test("thẻ không có data-job-id trả về null", () => {
    expect(parseJobCard('<div class="job-item-search-result">rong</div>')).toBeNull()
  })
})

describe("parseCardLocation", () => {
  test("lấy từ city-text chứ không lấy từ tooltip", () => {
    // TopCV nhét cả một khối HTML escape hai lần vào title= của label.address,
    // trong đó có câu "Địa điểm làm việc đã được cập nhật...". Bóc nhầm chỗ đó
    // thì địa điểm thành cả một đoạn văn.
    for (const card of parseJobCards(searchHtml)) {
      if (card.location) {
        expect(card.location).not.toContain("Địa điểm làm việc đã được cập nhật")
        expect(card.location.length).toBeLessThan(60)
      }
    }
  })

  test("không có city-text thì trả null", () => {
    expect(parseCardLocation("<div>khong co gi</div>")).toBeNull()
  })
})

describe("lương", () => {
  test('"Thoả thuận" được coi là không công bố lương', () => {
    const card = parseJobCard(
      '<div class="job-item-search-result" data-job-id="1">' +
        '<a href="https://www.topcv.vn/viec-lam/abc/1.html">' +
        '<h3 class="title "><a><span title="Lap trinh vien">Lap trinh vien</span></a></h3>' +
        '<label class="salary"><span>Thoả thuận</span></label></a></div>',
    )
    expect(card?.salary).toBeNull()
  })

  test("mức lương có số thì giữ nguyên", () => {
    const card = parseJobCard(
      '<div class="job-item-search-result" data-job-id="2">' +
        '<a href="https://www.topcv.vn/viec-lam/abc/2.html">' +
        '<h3 class="title "><a><span title="Dev">Dev</span></a></h3>' +
        '<label class="salary"><span>Tới 30 triệu</span></label></a></div>',
    )
    expect(card?.salary).toBe("Tới 30 triệu")
  })
})

describe("parseJobDescription", () => {
  const description = parseJobDescription(detailHtml)

  test("bóc được mô tả từ trang chi tiết", () => {
    expect(description).not.toBeNull()
    expect(description!.length).toBeGreaterThan(200)
  })

  test("giữ lại tiêu đề từng mục", () => {
    // Khung chấm điểm phân biệt phần mô tả với phần yêu cầu; gộp thành một
    // khối văn xuôi sẽ làm mất thông tin đó.
    expect(description).toContain("Mô tả công việc")
  })

  test("không còn thẻ HTML", () => {
    expect(description).not.toContain("<li>")
    expect(description).not.toContain("<strong>")
  })

  test("trang không có khối mô tả trả null", () => {
    expect(parseJobDescription("<html><body>trong</body></html>")).toBeNull()
  })
})

describe("parseDetailTitle", () => {
  test("bóc được chức danh và công ty từ trang chi tiết thật", () => {
    // Trang chi tiết TopCV không có <h1> và không có og:title; chỗ duy nhất có
    // chức danh dạng sạch là thẻ <title>.
    const { title, company } = parseDetailTitle(detailHtml)
    expect(title.length).toBeGreaterThan(0)
    expect(title).not.toStartWith("Tuyển")
    expect(title).not.toContain("làm việc tại")
    expect(company).not.toBeNull()
  })

  test("giải mã thực thể trong tiêu đề", () => {
    const { title } = parseDetailTitle(
      "<title>Tuyển Dev (React &amp; Node) làm việc tại Công ty A</title>",
    )
    expect(title).toBe("Dev (React & Node)")
  })

  test("không khớp khuôn thì trả nguyên chuỗi, KHÔNG trả rỗng", () => {
    // Tiêu đề hơi dài vẫn dùng được; tiêu đề rỗng thì tin bị loại khỏi kết quả.
    const { title, company } = parseDetailTitle("<title>Một tiêu đề lạ</title>")
    expect(title).toBe("Một tiêu đề lạ")
    expect(company).toBeNull()
  })

  test("không có thẻ title thì trả rỗng chứ không nổ", () => {
    expect(parseDetailTitle("<html><body>x</body></html>")).toEqual({
      title: "",
      company: null,
    })
  })
})

describe("searchUrl", () => {
  test("bỏ dấu tiếng Việt khi dựng đường dẫn", () => {
    expect(searchUrl({ query: "lập trình viên" })).toBe(
      "https://www.topcv.vn/tim-viec-lam-lap-trinh-vien",
    )
  })

  test("không có từ khóa thì lấy trang tổng", () => {
    expect(searchUrl({})).toBe("https://www.topcv.vn/tim-viec-lam")
  })

  test("trang 1 không thêm tham số page", () => {
    expect(searchUrl({ query: "react", page: 1 })).not.toContain("page=")
  })

  test("trang 2 trở đi mới thêm page", () => {
    expect(searchUrl({ query: "react", page: 2 })).toContain("page=2")
  })

  test("KHÔNG đưa địa điểm vào URL", () => {
    // TopCV lọc bằng cityIds[] với mã số không công bố, nên nhét tên thành phố
    // vào đường dẫn chỉ tạo ra URL 404.
    expect(searchUrl({ query: "react" })).not.toContain("ho-chi-minh")
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

  test("so khớp không phân biệt dấu", () => {
    expect(matchesLocation("Hà Nội", "ha noi")).toBe(true)
    expect(matchesLocation("Hồ Chí Minh", "Ho Chi Minh")).toBe(true)
  })

  test("tin đa thành phố vẫn khớp", () => {
    expect(matchesLocation("Hà Nội, Hồ Chí Minh", "ho chi minh")).toBe(true)
  })

  test("thành phố khác thì không khớp", () => {
    expect(matchesLocation("Hà Nội", "Đà Nẵng")).toBe(false)
  })

  test("địa điểm null thì không khớp", () => {
    expect(matchesLocation(null, "ha noi")).toBe(false)
  })
})

describe("decodeEntities", () => {
  test("giải mã thực thể có tên", () => {
    expect(decodeEntities("A &amp; B")).toBe("A & B")
    expect(decodeEntities("&quot;x&quot;")).toBe('"x"')
  })

  test("giải mã thực thể dạng số", () => {
    expect(decodeEntities("&#039;")).toBe("'")
  })

  test("giữ nguyên chuỗi không phải thực thể", () => {
    expect(decodeEntities("100% & tăng")).toBe("100% & tăng")
  })
})
