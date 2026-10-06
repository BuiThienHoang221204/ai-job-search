import type { Job } from '@/generated/prisma/client';

export interface LetterTarget {
  company: string;
  title: string;
  description: string;
  jobId: string | null;
}

export interface DocumentParams {
  question?: string;
  characterLimit?: number;
  jobDescription?: string;
  company?: string;
  title?: string;
}

export const emailTitle = (title: string, company: string): string =>
  `Mail ứng tuyển: ${title} - ${company}`.slice(0, 160);

/** Đích của thư: lấy từ tin có sẵn, không có thì từ JD dán tay. */
export function letterTarget(
  job: Job | null,
  params: DocumentParams,
): LetterTarget | null {
  if (job) {
    return {
      company: job.company,
      title: job.title,
      description: job.description,
      jobId: job.id,
    };
  }

  if (params.jobDescription && params.company && params.title) {
    return {
      company: params.company,
      title: params.title,
      description: params.jobDescription,
      jobId: null,
    };
  }

  return null;
}
