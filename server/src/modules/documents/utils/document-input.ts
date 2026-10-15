import { BadRequestException } from '@nestjs/common';
import type { ZodError } from 'zod';
import {
  resolveLayout,
  SECTION_TITLE_MAX,
  type CvLayout,
} from '../templates/cv-layout';
import {
  cvEditSchema,
  identityEditSchema,
  type CvEditResult,
  type IdentityEdit,
} from '../schemas/document.schema';

const issueDetail = (error: ZodError): string =>
  error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'nội dung'}: ${issue.message}`)
    .join('; ');

/** Đổi lỗi zod thành 400 — để ném thẳng thì Nest trả 500. */
export const parseCvEdit = (raw: unknown): CvEditResult => {
  const parsed = cvEditSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new BadRequestException(
    `Nội dung CV không hợp lệ — ${issueDetail(parsed.error)}`,
  );
};

export const parseIdentityEdit = (raw: unknown): IdentityEdit => {
  const parsed = identityEditSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new BadRequestException(
    `Phần đầu CV không hợp lệ — ${issueDetail(parsed.error)}`,
  );
};

/** Bố cục người dùng gửi lên; tên mục quá dài nhận 400 thay vì bị cắt lén. */
export const parseLayoutEdit = (raw: unknown): CvLayout => {
  const layout = resolveLayout(raw);
  for (const title of Object.values(layout.titles ?? {})) {
    if (title.length > SECTION_TITLE_MAX) {
      throw new BadRequestException(
        `Tên mục tối đa ${SECTION_TITLE_MAX} ký tự — "${title.slice(0, 20)}…" quá dài`,
      );
    }
  }
  return layout;
};

/** Ba trường của một JD dán tay, hoặc 400. */
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
