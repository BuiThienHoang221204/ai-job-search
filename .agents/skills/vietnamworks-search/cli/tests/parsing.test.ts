import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  decodeEntities,
  descriptionFromDetailHtml,
  flightBuffer,
  flightFieldValues,
  flightJobObject,
  flightTextChunks,
  fullerHtml,
  htmlToText,
  idFromSlug,
  isTruncated,
  jobFromDetailHtml,
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

/** Trang chi tiết thật, đã lược còn các thẻ script chứa payload RSC. */
const detailHtml = readFileSync(join(import.meta.dir, "fixtures", "detail.html"), "utf8")

/** Chính tin đó trong API tìm kiếm, tức bản mô tả đã bị cắt. */
const detailJob = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "detail-job.json"), "utf8"),
) as ApiJob

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
  test("kết quả tìm kiếm luôn có sẵn một mô tả", () => {
    for (const job of jobs) {
      expect(toJobDetail(job)!.description).not.toBeNull()
    }
  })

  test("nhưng mô tả đó bị API CẮT, không phải bản đầy đủ", () => {
    // Đây là lỗi đã lưu 13/13 tin VietnamWorks với mô tả thiếu quá nửa: chuỗi
    // cụt vẫn dài hơn ngưỡng 80 ký tự nên không nhánh nào chặn được.
    for (const job of jobs) {
      expect(isTruncated(job.jobDescription) || isTruncated(job.jobRequirement)).toBe(true)
    }
  })
})

describe("isTruncated", () => {
  test("nhận cả ba chấm rời lẫn ký tự một ô", () => {
    expect(isTruncated("<p>còn nữa...</p>")).toBe(true)
    expect(isTruncated("<p>còn nữa…</p>")).toBe(true)
  })

  test("mô tả trọn vẹn thì không", () => {
    expect(isTruncated("<p>Hết.</p>")).toBe(false)
    expect(isTruncated(null)).toBe(false)
  })
})

describe("trang chi tiết (payload RSC)", () => {
  test("đọc được các đoạn văn bản rời", () => {
    const chunks = flightTextChunks(flightBuffer(detailHtml))
    expect(chunks.size).toBeGreaterThan(0)
  })

  test("cắt đoạn theo BYTE, không theo ký tự", () => {
    // Đoạn mô tả đầy 1.103 byte nhưng chỉ 1.083 ký tự vì có dấu "•". Cắt theo
    // ký tự sẽ nuốt luôn dấu mở đoạn sau.
    const chunks = flightTextChunks(flightBuffer(detailHtml))
    for (const text of chunks.values()) expect(text).not.toContain(":T")
  })

  test("giải được tham chiếu \"$<id>\" sang đoạn rời", () => {
    const buffer = flightBuffer(detailHtml)
    const values = flightFieldValues(buffer, flightTextChunks(buffer), "jobDescription")
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) expect(value.startsWith("$")).toBe(false)
  })

  test("dựng lại mô tả dài hơn hẳn bản API và không còn dấu cắt", () => {
    const fromApi = toDescription(detailJob)!
    const full = descriptionFromDetailHtml(detailHtml, detailJob)!

    expect(full.length).toBeGreaterThan(fromApi.length)
    expect(isTruncated(full)).toBe(false)
    expect(full).toContain("Mô tả công việc")
    expect(full).toContain("Yêu cầu ứng viên")
  })

  test("giữ cả hai phần, không chỉ phần mô tả", () => {
    // Phần mô tả là tham chiếu "$<id>", phần yêu cầu nằm thẳng trong JSON —
    // sửa đúng một dạng thì nửa còn lại vẫn cụt.
    const buffer = flightBuffer(detailHtml)
    const chunks = flightTextChunks(buffer)

    expect(fullerHtml(flightFieldValues(buffer, chunks, "jobDescription"), detailJob.jobDescription))
      .not.toBeNull()
    expect(fullerHtml(flightFieldValues(buffer, chunks, "jobRequirement"), detailJob.jobRequirement))
      .not.toBeNull()
  })

  test("KHÔNG nhận một đoạn không khớp phần đầu", () => {
    // Trang còn chứa mô tả của các tin gợi ý; lấy nhầm thì tin này mang mô tả
    // của tin khác mà không có gì báo.
    const buffer = flightBuffer(detailHtml)
    const chunks = flightTextChunks(buffer)
    const values = flightFieldValues(buffer, chunks, "jobDescription")

    expect(fullerHtml(values, "<p>Một tin hoàn toàn khác, dài dòng cho đủ...</p>")).toBeNull()
  })

  test("HTML không phải Next.js thì trả null chứ không ném", () => {
    expect(descriptionFromDetailHtml("<html><body>trống</body></html>", detailJob)).toBeNull()
  })
})

describe("dựng tin chỉ từ HTML", () => {
  const url = "https://www.vietnamworks.com/full-stack-developer-2096266-jv"

  test("tìm được object JSON của tin theo jobId", () => {
    const raw = flightJobObject(flightBuffer(detailHtml), "2096266")
    expect(raw).not.toBeNull()
    expect(String(raw!.jobTitle)).toBe("Full Stack Developer")
  })

  test("jobId không có trên trang thì trả null", () => {
    expect(flightJobObject(flightBuffer(detailHtml), "999999")).toBeNull()
  })

  test("dựng được tin đầy đủ khi API không dò lại được", () => {
    // API tìm lại tin bằng từ khoá trong alias, và tin đăng lâu thì không ra
    // nữa — 6/16 tin của lần backfill đầu tiên rơi vào đúng cảnh này.
    const job = jobFromDetailHtml(detailHtml, url)!

    expect(job.id).toBe("2096266")
    expect(job.title).toBe("Full Stack Developer")
    expect(job.description!.length).toBeGreaterThan(toDescription(detailJob)!.length)
    expect(isTruncated(job.description)).toBe(false)
  })

  test("KHÔNG để tham chiếu chưa giải lọt ra ngoài", () => {
    // `skills` là "$<id>" trỏ sang dòng khác; giữ nguyên thì toJobCard gọi
    // `.map` trên một chuỗi và ném lỗi.
    const job = jobFromDetailHtml(detailHtml, url)!

    expect(Array.isArray(job.tags)).toBe(true)
    expect(JSON.stringify(job)).not.toMatch(/"\$[0-9a-f]+"/)
  })

  test("URL không có jobId thì trả null", () => {
    expect(jobFromDetailHtml(detailHtml, "https://www.vietnamworks.com/viec-lam")).toBeNull()
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
