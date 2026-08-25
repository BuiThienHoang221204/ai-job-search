import type { Job } from '../../generated/prisma/client.js';

/** Từ vựng dùng chung của cụm documents. **Hàm thuần** — không Prisma, không Nest. */

/**
 * Đích của một lá thư: viết cho công ty nào, vị trí nào, theo mô tả nào.
 *
 * Khái niệm này tồn tại vì cùng một việc soạn thảo có HAI nguồn tin tuyển dụng:
 * một tin đã nằm trong database, hoặc một JD người dùng dán tay mà hệ thống cố
 * ý không lưu lại thành tin (xem `createApplicationEmail`). Phần soạn thảo chỉ
 * cần ba trường dưới đây, nên nó không được phép biết nguồn nào - có vậy thêm
 * nguồn thứ ba sau này mới không phải sửa chỗ viết prompt.
 */
export interface LetterTarget {
  company: string;
  title: string;
  description: string;
  /** Id tin trong database. `null` = JD dán tay, không có tin nào để tra cứu. */
  jobId: string | null;
}

/**
 * Tham số người dùng nhập lúc bấm nút, cất tạm trong `Document.content` cho tới
 * khi worker chạy tới. Sinh xong thì `content` bị thay bằng kết quả của model.
 */
export interface DocumentParams {
  question?: string;
  characterLimit?: number;
  jobDescription?: string;
  company?: string;
  title?: string;
}

/**
 * Tiêu đề dòng trong kho tài liệu. Cắt ngắn vì chức danh trên tin tuyển dụng có
 * thể dài cả dòng và danh sách chỉ có một dòng cho mỗi bản ghi.
 */
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
