import { BASE_URL, htmlFetch, parseDetail, type JobDetail } from "../helpers.ts"

/** Lấy chi tiết một tin theo slug ("<ten-tin>-<hash>") hoặc URL đầy đủ. */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (slugOrUrl.match(/\/viec-lam\/([^/?#]+)/)?.[1] ?? "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "")
  if (!slug) return null

  const html = await htmlFetch(`${BASE_URL}/viec-lam/${slug}`)
  return html ? parseDetail(html, slug) : null
}
