import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  decodeEntities,
  htmlToText,
  idFromSlug,
  matchesLocation,
  parseLocation,
  parseSalary,
  queryFromSlug,
  slugFromUrl,
  toDescription,
  toJobCard,
  toJobDetail,
  type ApiJob,
  type ApiResponse,
} from "../src/helpers.ts"

const response = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "search.json"), "utf8"),
) as ApiResponse

const jobs = response.data ?? []

describe("fixture", () => {
  test("có dữ liệu thật để test", () => {
    expect(jobs.length).toBeGreaterThan(0)
    expect(response.meta?.code).toBe(200)
  })
})

describe("toJobCard", () => {
  test("chuyển được mọi tin trong fixture", () => {
    const cards = jobs.map(toJobCard).filter(Boolean)
    expect(cards).toHaveLength(jobs.length)
  })

  test("id là số, dùng làm externalId", () => {
    for (const job of jobs) expect(toJobCard(job)!.id).toMatch(/^\d+$/)
  })

  test("slug lấy từ jobUrl chứ không ghép tay từ alias", () => {
    // alias trong dữ liệu có khi còn dấu gạch thừa ở cuối; ghép tay ra URL 404.
    for (const job of jobs) {
      const card = toJobCard(job)!
      expect(card.slug).toEndWith("-jv")
      expect(card.slug).not.toContain("://")
    }
  })

  test("thiếu jobId thì trả null chứ không nổ", () => {
    expect(toJobCard({ jobTitle: "x", jobUrl: "https://a/b-1-jv" })).toBeNull()
  })

  test("thiếu tiêu đề thì trả null", () => {
    expect(toJobCard({ jobId: 1, jobUrl: "https://a/b-1-jv", jobTitle: "  " })).toBeNull()
  })

  test("tags lấy từ skills", () => {
    const withSkills = jobs.find((job) => (job.skills ?? []).length > 0)!
    expect(toJobCard(withSkills)!.tags.length).toBeGreaterThan(0)
  })
})

describe("parseSalary", () => {
  test('isSalaryVisible = false thì trả null, KHÔNG trả "0"', () => {
    // "0 ₫" là một con số sai; null nói đúng rằng tin không công bố lương.
    const hidden = jobs.filter((job) => job.isSalaryVisible === false)
    expect(hidden.length).toBeGreaterThan(0)
    for (const job of hidden) expect(parseSalary(job)).toBeNull()
  })

  test("lương công bố thì giữ nguyên chuỗi đẹp của API", () => {
    const visible = jobs.filter((job) => job.isSalaryVisible === true)
    expect(visible.length).toBeGreaterThan(0)
    for (const job of visible) {
      expect(parseSalary(job)).toBe(job.prettySalary!)
    }
  })

  test('"Thương lượng" bị coi là không công bố dù cờ nói ngược lại', () => {
    expect(
      parseSalary({ isSalaryVisible: true, prettySalary: "Thương lượng" }),
    ).toBeNull()
  })

  test("prettySalary rỗng thì trả null", () => {
    expect(parseSalary({ isSalaryVisible: true, prettySalary: "" })).toBeNull()
    expect(parseSalary({})).toBeNull()
  })
})

describe("parseLocation", () => {
  test('bỏ hậu tố ", Vietnam"', () => {
    // Giữ lại thì mọi tin đều có nó và bộ lọc phải xử lý thêm một biến thể
    // vô nghĩa.
    const location = parseLocation({
      workingLocations: [{ address: "Hà Nội, Vietnam" }],
    })
    expect(location).toBe("Hà Nội")
  })

  test("gộp nhiều địa điểm và bỏ trùng", () => {
    const location = parseLocation({
      workingLocations: [
        { address: "Hà Nội, Vietnam" },
        { address: "Hồ Chí Minh, Vietnam" },
        { address: "Hà Nội, Vietnam" },
      ],
    })
    expect(location).toBe("Hà Nội, Hồ Chí Minh")
  })

  test("không có workingLocations thì lùi về address", () => {
    expect(parseLocation({ address: "Số 22 Ngô Quyền - Hà Nội - Việt Nam" })).toBe(
      "Số 22 Ngô Quyền - Hà Nội",
    )
  })

  test("không có gì thì trả null", () => {
    expect(parseLocation({})).toBeNull()
  })

  test("mọi tin trong fixture đều có địa điểm", () => {
    for (const job of jobs) expect(parseLocation(job)).not.toBeNull()
  })
})

describe("toDescription", () => {
  test("ghép mô tả và yêu cầu, giữ hai tiêu đề", () => {
    // Khung chấm điểm phân biệt "công việc làm gì" với "ứng viên cần gì".
    const job = jobs.find((j) => j.jobDescription && j.jobRequirement)!
    const text = toDescription(job)!
    expect(text).toContain("Mô tả công việc")
    expect(text).toContain("Yêu cầu ứng viên")
  })

  test("bỏ hết thẻ HTML", () => {
    for (const job of jobs) {
      const text = toDescription(job)
      if (text) {
        expect(text).not.toContain("<p>")
        expect(text).not.toContain("<li>")
        expect(text).not.toContain("&nbsp;")
      }
    }
  })

  test("mô tả đủ dài để chấm điểm", () => {
    // Backend bỏ qua tin có mô tả dưới 80 ký tự.
    for (const job of jobs) {
      expect(toDescription(job)!.length).toBeGreaterThan(80)
    }
  })

  test("không có nội dung nào thì trả null", () => {
    expect(toDescription({})).toBeNull()
  })
})

describe("toJobDetail", () => {
  test("mô tả nằm SẴN trong kết quả tìm kiếm", () => {
    // Đây là điểm khác biệt lớn nhất so với itviec/topcv: không cần thêm một
    // request cho mỗi tin.
    for (const job of jobs) {
      expect(toJobDetail(job)!.description).not.toBeNull()
    }
  })
})

describe("slugFromUrl / idFromSlug", () => {
  test("trích slug từ URL đầy đủ", () => {
    expect(slugFromUrl("https://www.vietnamworks.com/dev-abc-2085157-jv")).toBe(
      "dev-abc-2085157-jv",
    )
  })

  test("cắt bỏ query và fragment", () => {
    expect(slugFromUrl("https://www.vietnamworks.com/a-1-jv?utm=x#top")).toBe("a-1-jv")
  })

  test("url rỗng trả null", () => {
    expect(slugFromUrl(undefined)).toBeNull()
  })

  test("lấy được id từ slug", () => {
    expect(idFromSlug("dev-abc-2085157-jv")).toBe("2085157")
  })

  test("slug sai dạng thì trả null", () => {
    expect(idFromSlug("khong-co-id")).toBeNull()
  })

  test("id trong fixture đi qua slug rồi quay lại vẫn khớp", () => {
    for (const job of jobs) {
      const card = toJobCard(job)!
      expect(idFromSlug(card.slug)).toBe(card.id)
    }
  })
})

describe("queryFromSlug", () => {
  test("đổi gạch nối thành khoảng trắng và bỏ đuôi id", () => {
    expect(queryFromSlug("senior-java-developer-2085157-jv")).toBe(
      "senior java developer",
    )
  })

  test("cắt còn 12 từ", () => {
    // Tin nhồi từ khoá có alias rất dài, và truy vấn quá dài làm API trả rỗng.
    const long = Array.from({ length: 30 }, (_, i) => `tu${i}`).join("-") + "-99-jv"
    expect(queryFromSlug(long).split(" ")).toHaveLength(12)
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
  })

  test("tin đa thành phố vẫn khớp", () => {
    expect(matchesLocation("Hà Nội, Hồ Chí Minh", "ho chi minh")).toBe(true)
  })

  test("thành phố khác thì không khớp", () => {
    expect(matchesLocation("Hà Nội", "Đà Nẵng")).toBe(false)
  })
})

describe("htmlToText / decodeEntities", () => {
  test("đổi <li> thành gạch đầu dòng", () => {
    expect(htmlToText("<ul><li>Một</li><li>Hai</li></ul>")).toBe("- Một\n- Hai")
  })

  test("giải mã thực thể", () => {
    expect(decodeEntities("A &amp; B &#39;x&#39;")).toBe("A & B 'x'")
  })

  test("gộp dòng trống thừa", () => {
    expect(htmlToText("<p>A</p><p></p><p></p><p>B</p>")).toBe("A\n\nB")
  })
})
