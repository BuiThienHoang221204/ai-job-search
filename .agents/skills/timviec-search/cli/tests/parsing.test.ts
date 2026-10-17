import { describe, expect, test } from "bun:test"
import {
  BlockedError,
  errorForStatus,
  idFrom,
  isBlockedPage,
  matchesLocation,
  newestFirst,
  salaryOf,
  toJobCard,
  toJobCards,
  type ApiJob,
} from "../src/helpers.ts"

/** Phản hồi thật của API nhận được 2026-10-17. */
const json = async <T>(name: string): Promise<T> =>
  (await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).json()) as T

const searchBody = await json<{ success: boolean; total: number; data: ApiJob[] }>("search-ke-toan.json")
const detailBody = await json<{ data: ApiJob }>("detail.json")
const detailPage = new TextDecoder().decode(
  Bun.gunzipSync(new Uint8Array(await Bun.file(new URL("./fixtures/detail-page.html.gz", import.meta.url)).arrayBuffer())),
)

describe("toJobCards", () => {
  const cards = toJobCards(searchBody.data)

  test("đủ 20 tin của một trang, mỗi tin có mã, tiêu đề, URL mở được", () => {
    expect(cards).toHaveLength(20)
    for (const card of cards) {
      expect(card.id).toMatch(/^\d{6,}$/)
      expect(card.title.length).toBeGreaterThan(3)
      expect(card.url).toBe(`https://timviec.ai/candidate/jobs/${card.id}`)
    }
  })

  test("mô tả gộp đủ ba phần để backend khỏi gọi detail", () => {
    for (const card of cards) {
      expect(card.description).toContain("Mô tả công việc:")
      expect(card.description).toContain("Yêu cầu ứng viên:")
      expect(card.description!.length).toBeGreaterThan(80)
    }
  })

  test("ngày đăng là ISO, địa chỉ kết thúc bằng tỉnh, có logo khi API có", () => {
    for (const card of cards) {
      expect(card.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(card.location).toBeTruthy()
    }
    expect(cards.filter((card) => card.companyLogo?.startsWith("https://")).length).toBeGreaterThan(0)
  })
})

describe("toJobCard", () => {
  test("bỏ tin thiếu tiêu đề", () => {
    expect(toJobCard({ id: "1557707155379847168", title: "  " })).toBeNull()
  })

  test("đọc được tin chi tiết", () => {
    const card = toJobCard(detailBody.data)
    expect(card?.id).toBe("1557707155379847168")
    expect(card?.salary).toBe("12 triệu / tháng")
  })
})

describe("newestFirst", () => {
  test("xếp theo lần đăng/làm mới gần nhất, tin không có ngày xuống cuối", () => {
    const cards = toJobCards(searchBody.data)
    const sorted = newestFirst([...cards, { ...cards[0], id: "1", postedAt: null }])
    const dates = sorted.map((card) => card.postedAt ?? "")
    expect(dates.slice(0, -1)).toEqual([...dates.slice(0, -1)].sort().reverse())
    expect(sorted.at(-1)?.postedAt).toBeNull()
  })
})

describe("salaryOf", () => {
  test("giữ nguyên chuỗi lương, thoả thuận thì null", () => {
    expect(salaryOf("12 - 20 triệu / tháng")).toBe("12 - 20 triệu / tháng")
    expect(salaryOf("Thỏa thuận")).toBeNull()
    expect(salaryOf("Thương lượng")).toBeNull()
    expect(salaryOf("")).toBeNull()
  })
})

describe("idFrom", () => {
  test("nhận mã số hoặc URL có slug", () => {
    expect(idFrom("1557707155379847168")).toBe("1557707155379847168")
    expect(idFrom("https://timviec.ai/candidate/jobs/1557707155379847168/nhan-vien-qa")).toBe("1557707155379847168")
    expect(idFrom("khong-phai-ma")).toBeNull()
  })
})

describe("isBlockedPage", () => {
  test("JSON thật của API không phải trang chặn", () => {
    expect(isBlockedPage(JSON.stringify(searchBody))).toBe(false)
  })

  test("trang tin thật kèm widget reCAPTCHA KHÔNG bị coi là chặn (bài học JobOKO)", () => {
    const withWidget = detailPage.replace("</body>", '<div class="g-recaptcha"></div></body>')
    expect(isBlockedPage(withWidget)).toBe(false)
  })

  test("trang thử thách không có nội dung là chặn", () => {
    expect(isBlockedPage("<html><title>Just a moment...</title><script src=\"https://challenges.cloudflare.com/x\"></script></html>")).toBe(true)
  })

  test("403 là BLOCKED, mã khác là lỗi thường", () => {
    expect(errorForStatus(403)).toBeInstanceOf(BlockedError)
    expect(errorForStatus(500)).not.toBeInstanceOf(BlockedError)
  })
})

describe("matchesLocation", () => {
  const hcm = "215/42 Nguyễn Xí, Phường 13, Quận Bình Thạnh, Thành phố Hồ Chí Minh"

  test("hiểu các cách viết TP.HCM, tên quốc gia là cả nước", () => {
    expect(matchesLocation(hcm, "Ho Chi Minh")).toBe(true)
    expect(matchesLocation(hcm, "HCM")).toBe(true)
    expect(matchesLocation(hcm, "Vietnam")).toBe(true)
    expect(matchesLocation(hcm, "Ha Noi")).toBe(false)
  })
})
