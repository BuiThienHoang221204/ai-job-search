import type { Prisma } from '../../generated/prisma/client.js';

/** Khai tường minh vì `include: { job: true }` kéo cả `description` — đo 2026-08-22: 42,7% phản hồi cho thứ không màn nào vẽ. */
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
