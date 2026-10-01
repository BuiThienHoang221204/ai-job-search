import {
  BASE_URL,
  describePosting,
  ExpiredError,
  htmlFetch,
  isExpiredPage,
  locationFromPosting,
  nfc,
  parseJobPosting,
  salaryFromPosting,
  type JobDetail,
} from "../helpers.ts"

/** Lấy chi tiết một tin theo slug ("viec-lam-<ten-tin>-xvi<id>") hoặc URL đầy đủ. */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? new URL(slugOrUrl).pathname.replace(/^\/+/, "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "")

  const id = slug.match(/^viec-lam-[a-z0-9-]+-xvi(\d+)$/)?.[1]
  if (!id) return null

  const url = `${BASE_URL}/${slug}`
  const html = await htmlFetch(url)
  if (!html) return null

  if (isExpiredPage(html)) throw new ExpiredError(`tin đã hết hạn nộp hồ sơ: ${slug}`)

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
    postedAt: posting?.datePosted ?? null,
    tags: posting?.industry
      ? nfc(posting.industry).split(",").map((tag) => tag.trim()).filter(Boolean)
      : [],
    url,
    description: describePosting(posting),
  }
}
