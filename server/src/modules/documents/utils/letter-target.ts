import type { Job } from '../../../generated/prisma/client.js';

/** Từ vựng chung của cụm documents. Hàm thuần: không Prisma, không Nest. */

/** Đích của một lá thư, cố ý KHÔNG nói nguồn là tin đã lưu hay JD dán tay — để thêm nguồn thứ ba không phải sửa prompt. */
export interface LetterTarget {
  company: string;
  title: string;
  description: string;
  /** Id tin trong database. `null` = JD dán tay, không có tin nào để tra cứu. */
  jobId: string | null;
}

/** Tham số lúc bấm nút, cất tạm trong `Document.content` cho tới khi worker đọc ra rồi ghi đè bằng kết quả model. */
export interface DocumentParams {
  question?: string;
  characterLimit?: number;
  jobDescription?: string;
  company?: string;
  title?: string;
}

/** Cắt ngắn vì chức danh trên tin có thể dài cả dòng, còn danh sách chỉ có một dòng mỗi bản ghi. */
export const emailTitle = (title: string, company: string): string =>
  `Mail ứng tuyển: ${title} - ${company}`.slice(0, 160);

/** Dựng đích của thư từ tin có sẵn, nếu không có thì từ JD dán tay. */
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
