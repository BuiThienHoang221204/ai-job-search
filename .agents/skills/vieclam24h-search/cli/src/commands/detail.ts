import { BASE_URL, htmlFetch, parseDetail, type JobDetail } from "../helpers.ts"

/** Lấy chi tiết một tin theo slug ("<nganh>/<ten-tin>-c<n>p<t>id<id>") hoặc URL đầy đủ. */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (new URL(slugOrUrl).pathname.replace(/^\/+/, "").replace(/\.html$/, ""))
    : slugOrUrl.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "")

  if (!/^[a-z0-9-]+\/[a-z0-9-]+-c\d+p\d+id\d+$/.test(slug)) return null

  const html = await htmlFetch(`${BASE_URL}/${slug}.html`)
  if (!html) return null

  return parseDetail(html)
}
