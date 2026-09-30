import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { BASE_URL, fold } from "./helpers.ts"

/**
 * Chỉ mục trang NGÀNH CON của Vieclam24h, dựng từ sitemap của chính trang.
 *
 * Vì sao cần: trang ngành cha chỉ lộ ra ~20 tin (phân trang `?page=` không đổi
 * nội dung phía server - đo 2026-09-29, trang 2 trùng 19/20 tin trang 1), còn
 * trang ngành con `/viec-lam-ke-toan/ke-toan-tong-hop.html` trả 20 tin KHÁC,
 * đúng chức danh 100%, 0 tin trùng trang cha. Sitemap `sub-occupation-*.xml`
 * liệt kê ~30.000 trang như vậy - thực chất là một chỉ mục từ khoá mà trang
 * CỐ Ý công bố cho máy đọc.
 */

const INDEX_URL = `${BASE_URL}/file/sitemap/sitemap-index.xml`

/** Sitemap đổi theo ngày (thư mục `daily/`); đệm một ngày là đủ và chỉ tốn ~7 request mỗi ngày. */
export const INDEX_TTL_MS = 24 * 60 * 60 * 1000

export const CACHE_FILE = join(tmpdir(), "vieclam24h-search", "sub-occupations.json")

const SUB_PAGE = /^\/viec-lam-[a-z0-9-]+\/[a-z0-9-]+\.html$/

/** Link các file `sub-occupation-N.xml` trong sitemap index - KHÔNG lấy `level-sub-occupation` (tổ hợp cấp bậc, trùng lặp). */
export function subSitemapUrls(indexXml: string): string[] {
  return [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1]!.trim())
    .filter((url) => /\/sub-occupation-\d+\.xml$/.test(url))
}

/** Đường dẫn trang ngành con trong một file sitemap. */
export function subPagePaths(sitemapXml: string): string[] {
  return [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => {
      try {
        return new URL(match[1]!.trim()).pathname
      } catch {
        return ""
      }
    })
    .filter((path) => SUB_PAGE.test(path))
}

type Cached = { fetchedAt: number; paths: string[] }

/**
 * Nạp chỉ mục: đọc đệm trên đĩa nếu còn hạn, không thì tải lại từ sitemap.
 * LỖI KHÔNG ĐƯỢC LÀM HỎNG LƯỢT TÌM: sitemap chết thì trả mảng rỗng và người gọi
 * lùi về trang ngành cha. Đệm hết hạn mà tải lại hỏng thì vẫn dùng đệm cũ.
 */
export async function loadSubPages(
  fetchText: (url: string) => Promise<string>,
  now = Date.now(),
  cacheFile = CACHE_FILE,
): Promise<string[]> {
  const cached = await readFile(cacheFile, "utf8")
    .then((raw) => JSON.parse(raw) as Cached)
    .catch(() => null)
  if (cached && now - cached.fetchedAt < INDEX_TTL_MS) return cached.paths

  try {
    const paths = new Set<string>()
    for (const url of subSitemapUrls(await fetchText(INDEX_URL))) {
      for (const path of subPagePaths(await fetchText(url))) paths.add(path)
    }
    if (!paths.size) return cached?.paths ?? []

    const fresh: Cached = { fetchedAt: now, paths: [...paths].sort() }
    await mkdir(dirname(cacheFile), { recursive: true })
    await writeFile(cacheFile, JSON.stringify(fresh))
    return fresh.paths
  } catch {
    return cached?.paths ?? []
  }
}

/**
 * Trang ngành con khớp từ khoá nhất: thử cụm DÀI NHẤT rồi rút dần từ cuối
 * ("kế toán trưởng sản xuất" -> "kế toán trưởng"), ưu tiên trang nằm dưới ngành
 * đã ánh xạ. Không rút xuống một từ khi từ khoá có nhiều từ: "kế" đứng một mình
 * không phải chức danh. Không khớp thì null.
 */
export function subPageFor(
  query: string,
  paths: readonly string[],
  occupationSlug?: string,
): string | null {
  const words = fold(query).trim().split(" ").filter(Boolean)
  if (!words.length) return null

  const bySlug = new Map<string, string[]>()
  for (const path of paths) {
    const [, parent, slug] = path.match(/^\/viec-lam-([a-z0-9-]+)\/([a-z0-9-]+)\.html$/) ?? []
    if (!parent || !slug) continue
    const list = bySlug.get(slug) ?? []
    list.push(parent)
    bySlug.set(slug, list)
  }

  const shortest = words.length === 1 ? 1 : 2
  for (let length = words.length; length >= shortest; length--) {
    const slug = words.slice(0, length).join("-")
    const parents = bySlug.get(slug)
    if (!parents) continue
    const parent =
      occupationSlug && parents.includes(occupationSlug) ? occupationSlug : parents[0]!
    return `/viec-lam-${parent}/${slug}.html`
  }
  return null
}
