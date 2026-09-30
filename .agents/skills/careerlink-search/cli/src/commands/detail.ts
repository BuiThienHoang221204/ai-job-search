import {
  BASE_URL,
  htmlFetch,
  locationFromPosting,
  nfc,
  parseJobDescription,
  parseJobPosting,
  salaryFromPosting,
  type JobDetail,
} from "../helpers.ts"

/** Lấy chi tiết một tin theo slug ("<ten-tin>/<id>") hoặc URL đầy đủ. */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (slugOrUrl.match(/\/tim-viec-lam\/([^?#]+\/\d+)/)?.[1] ?? "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "").replace(/^tim-viec-lam\//, "")

  const id = slug.match(/\/(\d+)$/)?.[1]
  if (!slug || !id) return null

  const url = `${BASE_URL}/tim-viec-lam/${slug}`
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
    companyUrl: organization?.sameAs ?? null,
    companyLogo: organization?.logo ?? null,
    location: locationFromPosting(posting),
    workMode: null,
    salary: salaryFromPosting(posting),
    // Trang chi tiết có ngày ĐĂNG thật, khác mốc cập nhật trên thẻ tìm kiếm.
    postedAt: posting?.datePosted ?? null,
    tags: posting?.industry
      ? nfc(posting.industry).split(",").map((tag) => tag.trim()).filter(Boolean)
      : [],
    url,
    description: parseJobDescription(html),
  }
}
