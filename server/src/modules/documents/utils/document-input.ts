import { BadRequestException } from '@nestjs/common';
import { cvEditSchema, type CvEditResult } from '../schemas/document.schema.js';

/** Đổi lỗi zod thành 400 — để `parse` ném thẳng thì Nest trả 500, giao diện không có gì cho người dùng sửa. */
export const parseCvEdit = (raw: unknown): CvEditResult => {
  const parsed = cvEditSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const detail = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'nội dung'}: ${issue.message}`)
    .join('; ');

  throw new BadRequestException(`Nội dung CV không hợp lệ — ${detail}`);
};

/** Ba trường của một JD dán tay, hoặc 400 — kiểm lại ngoài DTO để service tự đứng vững. */
export function requirePastedJob(input: {
  jobDescription?: string;
  company?: string;
  title?: string;
}): { jobDescription: string; company: string; title: string } {
  const { jobDescription, company, title } = input;

  if (!jobDescription || !company || !title) {
    throw new BadRequestException(
      'Cần chọn một tin tuyển dụng, hoặc dán mô tả công việc kèm tên công ty và vị trí',
    );
  }

  return { jobDescription, company, title };
}
