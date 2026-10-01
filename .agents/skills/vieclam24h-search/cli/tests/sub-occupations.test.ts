import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseJobCards } from "../src/helpers.ts"
import {
  INDEX_TTL_MS,
  loadSubPages,
  subPageFor,
  subPagePaths,
  subSitemapUrls,
} from "../src/sub-occupations.ts"

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8")

// sitemap-index.xml là bản thật; sub-occupation-0.xml là 40 mục thật trích từ 5.000 mục của file gốc.
const indexXml = fixture("sitemap-index.xml")
const paths = subPagePaths(fixture("sub-occupation-0.xml"))

describe("đọc sitemap", () => {
  test("chỉ lấy sub-occupation-N.xml, bỏ level-sub-occupation và các sitemap khác", () => {
    const urls = subSitemapUrls(indexXml)
    expect(urls.length).toBe(6)
    for (const url of urls) expect(url).toMatch(/\/sub-occupation-\d+\.xml$/)
  })

  test("đường dẫn trang ngành con đúng dạng /viec-lam-<nganh>/<cum>.html", () => {
    expect(paths.length).toBe(40)
    expect(paths).toContain("/viec-lam-ke-toan/ke-toan-tong-hop.html")
    for (const path of paths) expect(path).toMatch(/^\/viec-lam-[a-z0-9-]+\/[a-z0-9-]+\.html$/)
  })
})

describe("subPageFor", () => {
  test("khớp nguyên cụm, bỏ dấu", () => {
    expect(subPageFor("Kế toán tổng hợp", paths)).toBe("/viec-lam-ke-toan/ke-toan-tong-hop.html")
    expect(subPageFor("frontend developer", paths)).toBe("/viec-lam-it-phan-mem/frontend-developer.html")
    expect(subPageFor("giáo viên tiếng Anh", paths)).toBe("/viec-lam-giao-duc-dao-tao/giao-vien-tieng-anh.html")
  })

  test("không có trang cho cả cụm thì rút dần từ cuối: 'kế toán trưởng sản xuất' -> 'kế toán trưởng'", () => {
    expect(subPageFor("kế toán trưởng sản xuất", paths)).toBe("/viec-lam-ke-toan/ke-toan-truong.html")
  })

  test("KHÔNG rút xuống một từ khi từ khoá có nhiều từ", () => {
    expect(subPageFor("kế abc xyz", ["/viec-lam-ke-toan/ke.html"])).toBeNull()
    expect(subPageFor("java", ["/viec-lam-it-phan-mem/java.html"])).toBe("/viec-lam-it-phan-mem/java.html")
  })

  test("cùng cụm ở hai ngành thì ưu tiên ngành đã ánh xạ", () => {
    const both = ["/viec-lam-ban-hang-kinh-doanh/ke-toan-kho.html", "/viec-lam-ke-toan/ke-toan-kho.html"]
    expect(subPageFor("kế toán kho", both, "ke-toan")).toBe("/viec-lam-ke-toan/ke-toan-kho.html")
  })

  test("chỉ mục rỗng (sitemap lỗi) thì null, để người gọi lùi về trang ngành cha", () => {
    expect(subPageFor("kế toán tổng hợp", [])).toBeNull()
  })
})

describe("trang ngành con", () => {
  test("danh sách nằm ở khoá 'jobs' chứ không phải 'jobsResponse' - vẫn đọc được", () => {
    const cards = parseJobCards(fixture("sub-ke-toan-tong-hop.html"))
    expect(cards).toHaveLength(20)
    for (const card of cards) expect(card.title.toLowerCase()).toContain("kế toán")
  })
})

describe("loadSubPages - đệm đĩa và đường lùi", () => {
  const freshCache = () => join(mkdtempSync(join(tmpdir(), "vl24h-test-")), "cache.json")

  const sitemaps = (url: string): Promise<string> =>
    Promise.resolve(url.endsWith("sitemap-index.xml") ? indexXml : fixture("sub-occupation-0.xml"))

  test("lần đầu tải sitemap, lần sau đọc đệm - KHÔNG tải lại trong hạn", async () => {
    const cache = freshCache()
    let calls = 0
    const counting = (url: string) => { calls += 1; return sitemaps(url) }

    const first = await loadSubPages(counting, 1_000, cache)
    const callsAfterFirst = calls
    const second = await loadSubPages(counting, 1_000 + INDEX_TTL_MS - 1, cache)

    expect(first).toContain("/viec-lam-ke-toan/ke-toan-tong-hop.html")
    expect(callsAfterFirst).toBe(7) // index + 6 file sub-occupation
    expect(second).toEqual(first)
    expect(calls).toBe(7)
  })

  test("sitemap lỗi và chưa có đệm thì trả rỗng, KHÔNG ném - lượt tìm lùi về ngành cha", async () => {
    const broken = () => Promise.reject(new Error("mất mạng"))
    expect(await loadSubPages(broken, 1_000, freshCache())).toEqual([])
  })

  test("đệm hết hạn mà tải lại lỗi thì vẫn dùng đệm cũ", async () => {
    const cache = freshCache()
    const first = await loadSubPages(sitemaps, 1_000, cache)
    const broken = () => Promise.reject(new Error("mất mạng"))
    expect(await loadSubPages(broken, 1_000 + INDEX_TTL_MS + 1, cache)).toEqual(first)
  })
})
