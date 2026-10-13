import { BASE_URL, htmlFetch, parseDetail, type JobDetail } from "../helpers.ts"

/** Lấy chi tiết một tin theo slug ("<ten-tin>-<id>") hoặc URL đầy đủ. */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (slugOrUrl.match(/\/(?:viec-lam|detail-jobs)\/([^/?#]+)/)?.[1] ?? "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "")
  if (!slug || !/-\d{4,}$/.test(slug)) return null

  const html = await htmlFetch(`${BASE_URL}/viec-lam/${slug}`)
  return html ? parseDetail(html, slug) : null
}
