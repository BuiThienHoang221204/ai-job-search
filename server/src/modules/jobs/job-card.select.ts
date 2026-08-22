import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Những trường của một tin mà THẺ CÔNG VIỆC cần, và không hơn.
 *
 * Vì sao phải khai tường minh: `include: { job: true }` của Prisma kéo về MỌI
 * cột, trong đó có `description`. Đo trên `GET /matches?limit=20` ngày
 * 2026-08-22: 128.863 byte cho 17 dòng, và riêng `job.description` chiếm
 * **55.051 byte - 42,7% cả phản hồi** - trong khi không màn danh sách nào vẽ
 * nó ra. Mô tả chỉ được đọc ở trang chi tiết, mà trang đó gọi `GET /jobs/:id`
 * riêng.
 *
 * `searchText` và `dedupeKey` còn tệ hơn một chút: chúng là trường nội bộ của
 * khâu quét tin, không có nghĩa gì với người dùng, và không nên rời khỏi máy
 * chủ.
 *
 * Dùng chung cho `jobs.service` và `matching.service` để hai bên không lệch
 * nhau: thêm một cột mới vào thẻ mà chỉ sửa một chỗ là màn kia thiếu dữ liệu.
 */
export const JOB_CARD_FIELDS = {
  id: true,
  source: true,
  externalId: true,
  url: true,
  title: true,
  company: true,
  companyLogo: true,
  location: true,
  workMode: true,
  salaryRaw: true,
  salaryMin: true,
  salaryMax: true,
  currency: true,
  tags: true,
  postedAt: true,
  scrapedAt: true,
  provinceCode: true,
  occupationCode: true,
} satisfies Prisma.JobSelect;

/** Thẻ công việc kèm cờ "đã lưu" của chính người đang xem. */
export const jobCardSelect = (userId: string) =>
  ({
    ...JOB_CARD_FIELDS,
    saves: { where: { userId }, select: { id: true } },
  }) satisfies Prisma.JobSelect;
