import {
  BASE_URL,
  htmlFetch,
  locationFromPosting,
  nfc,
  parseJobDescription,
  parseJobPosting,
  salaryFromPosting,
  skillsFromPosting,
  type JobDetail,
} from "../helpers.ts"

/** Lấy chi tiết một tin theo slug ("<ten-tin>.<ID>") hoặc URL đầy đủ. */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (slugOrUrl.match(/\/tim-viec-lam\/([^/?#]+?)\.html/)?.[1] ?? "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "")

  const id = slug.match(/\.([0-9A-F]{6,})$/i)?.[1]
  if (!slug || !id) return null

  const url = `${BASE_URL}/vi/tim-viec-lam/${slug}.html`
  const html = await htmlFetch(url)
  if (!html) return null

  const posting = parseJobPosting(html)
  const title = posting?.title ? nfc(posting.title).trim() : ""
  if (!title) return null

  const organization = posting?.hiringOrganization

  return {
    id,
    slug,
    title,
    company: organization?.name ? nfc(organization.name).trim() || null : null,
    companyUrl: organization?.url ?? null,
    companyLogo: organization?.logo ?? null,
    location: locationFromPosting(posting),
    workMode: null,
    salary: salaryFromPosting(posting),
    // Trang chi tiết có ngày ĐĂNG thật, khác mốc "Cập nhật" trên thẻ tìm kiếm.
    postedAt: posting?.datePosted ?? null,
    tags: skillsFromPosting(posting),
    url,
    description: parseJobDescription(html),
  }
}
