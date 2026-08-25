import {
  BASE_URL,
  htmlFetch,
  parseDetailTitle,
  parseJobDescription,
  type JobDetail,
} from "../helpers.ts"

/**
 * Lấy chi tiết một tin theo slug ("<ten-tin>/<id>") hoặc URL đầy đủ.
 *
 * Khác ITviec: trang chi tiết của TopCV KHÔNG nhúng lại thẻ tìm kiếm, nên mọi
 * trường phải bóc riêng từ markup của trang chi tiết.
 */
export async function detail(slugOrUrl: string): Promise<JobDetail | null> {
  const slug = slugOrUrl.startsWith("http")
    ? (slugOrUrl.match(/\/viec-lam\/([^?#]+?)\.html/)?.[1] ?? "")
    : slugOrUrl.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "")

  if (!slug) return null

  const html = await htmlFetch(`${BASE_URL}/viec-lam/${slug}.html`)
  if (!html) return null

  const description = parseJobDescription(html)

  // Id là phần số cuối slug. Lấy từ đó thay vì dò trong trang: trang chi tiết
  // còn có các tin gợi ý bên cạnh, mỗi tin cũng mang data-job-id riêng.
  const id = slug.match(/\/(\d+)$/)?.[1] ?? slug

  const { title, company } = parseDetailTitle(html)

  return {
    id,
    slug,
    title,
    company,
    companyUrl:
      html.match(/href="(https:\/\/www\.topcv\.vn\/cong-ty\/[^"?]+)/)?.[1] ?? null,
    // Trang chi tiết dùng `src` chứ không lazy-load như thẻ tìm kiếm. Lọc theo
    // đường dẫn company_logos để không vớ phải ảnh quảng cáo hay banner.
    companyLogo:
      html.match(/<img[^>]*\bsrc="([^"]*company_logos[^"]*)"/)?.[1] ?? null,
    location: null,
    workMode: null,
    salary: null,
    postedAt: null,
    tags: [],
    url: `${BASE_URL}/viec-lam/${slug}.html`,
    description,
  }
}
