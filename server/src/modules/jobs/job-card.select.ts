import type { Prisma } from '@/generated/prisma/client';

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

export const jobCardSelect = (userId: string) =>
  ({
    ...JOB_CARD_FIELDS,
    saves: { where: { userId }, select: { id: true } },
  }) satisfies Prisma.JobSelect;

export const PUBLIC_JOB_FIELDS = {
  id: true,
  source: true,
  url: true,
  title: true,
  company: true,
  companyLogo: true,
  location: true,
  workMode: true,
  tags: true,
  postedAt: true,
  scrapedAt: true,
  provinceCode: true,
  occupationCode: true,
} satisfies Prisma.JobSelect;

export const PUBLIC_JOB_DETAIL_SELECT = {
  ...PUBLIC_JOB_FIELDS,
  description: true,
  requirements: true,
} satisfies Prisma.JobSelect;
