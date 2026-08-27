import type { CvContent, Identity } from '../content.types.js';
import { buildCvHeader, buildCvSections } from './body.js';
import { resolveLayout, type DocumentLanguage } from './cv-layout.js';
import { htmlDocument } from './html.js';
import { CV_THEMES, type CvTemplateMeta, type CvTheme } from './themes.js';

/**
 * Kho mẫu CV. Chỗ DUY NHẤT biết `templateId` là chuỗi gì, nên thêm mẫu là thêm
 * một mục trong `themes.ts` chứ không phải sửa controller hay migration.
 */

/** Mẫu mặc định. Phải khớp `@default` của cột `Document.templateId`. */
export const DEFAULT_TEMPLATE_ID = 'classic';

/** Tuỳ chọn trình bày. Người dùng chọn, KHÔNG phải model sinh. */
export type CvTemplateOptions = {
  accent: string;
};

/** Danh mục mẫu để giao diện dựng kho chọn mẫu. */
export const CV_TEMPLATES: readonly CvTemplateMeta[] = CV_THEMES.map(
  (theme) => theme.meta,
);

/** Id có nằm trong danh mục hay không. */
export const isTemplateId = (value: string): boolean =>
  CV_THEMES.some((theme) => theme.meta.id === value);

/**
 * Tra mẫu theo id, quay về mặc định khi không thấy. Không ném lỗi: gỡ một mẫu ở
 * bản sau sẽ để lại tài liệu cũ trỏ vào id không còn tồn tại.
 */
const findTheme = (templateId: string | null | undefined): CvTheme =>
  CV_THEMES.find((theme) => theme.meta.id === templateId) ?? CV_THEMES[0];

/** Chỉ nhận `#rrggbb`. Màu đi thẳng vào CSS nên đây là ranh giới an toàn. */
export const isAccent = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * Đọc tuỳ chọn đã lưu, điền mặc định cho phần thiếu hoặc sai. Nhận `unknown` vì
 * nguồn là cột Json; giá trị hỏng quay về mặc định chứ không làm hỏng cả bản CV.
 */
export const resolveTemplateOptions = (
  templateId: string | null | undefined,
  raw: unknown,
): CvTemplateOptions => {
  const theme = findTheme(templateId);
  if (!theme.meta.usesAccent) return { accent: theme.meta.accent };

  const accent = (raw as { accent?: unknown } | null)?.accent;
  return { accent: isAccent(accent) ? accent : theme.meta.accent };
};

/** Sinh CV thành một tài liệu HTML tự chứa, theo mẫu đã chọn. */
export const renderCvHtml = (
  identity: Identity,
  content: CvContent,
  templateId: string | null | undefined = DEFAULT_TEMPLATE_ID,
  rawOptions: unknown = null,
  rawLayout: unknown = null,
  language: DocumentLanguage = 'vi',
): string => {
  const theme = findTheme(templateId);
  const options = resolveTemplateOptions(templateId, rawOptions);
  const layout = resolveLayout(rawLayout);

  // `page-bar` là phần tử trang trí có ở MỌI mẫu; mẫu nào không tạo dáng cho nó
  // thì nó là div rỗng không chiếm chỗ.
  const body = [
    '<div class="page-bar"></div>',
    buildCvHeader(identity),
    buildCvSections(content, layout, language),
  ].join('\n');

  return htmlDocument({
    title: `${identity.name} - CV`,
    css: theme.css(options.accent),
    body,
  });
};
