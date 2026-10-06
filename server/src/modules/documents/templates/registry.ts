import type { CvContent, Identity } from '../content.types';
import { buildCvHeader, buildCvSections } from './body';
import { resolveLayout, type DocumentLanguage } from './cv-layout';
import { htmlDocument } from './html';
import { CV_THEMES, type CvTemplateMeta, type CvTheme } from './themes';

export const DEFAULT_TEMPLATE_ID = 'classic';

export type CvTemplateOptions = {
  accent: string;
};

export const CV_TEMPLATES: readonly CvTemplateMeta[] = CV_THEMES.map(
  (theme) => theme.meta,
);

export const isTemplateId = (value: string): boolean =>
  CV_THEMES.some((theme) => theme.meta.id === value);

const findTheme = (templateId: string | null | undefined): CvTheme =>
  CV_THEMES.find((theme) => theme.meta.id === templateId) ?? CV_THEMES[0];

export const isAccent = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

/** Giá trị hỏng từ cột Json quay về mặc định chứ không làm hỏng cả bản CV. */
export const resolveTemplateOptions = (
  templateId: string | null | undefined,
  raw: unknown,
): CvTemplateOptions => {
  const theme = findTheme(templateId);
  if (!theme.meta.usesAccent) return { accent: theme.meta.accent };

  const accent = (raw as { accent?: unknown } | null)?.accent;
  return { accent: isAccent(accent) ? accent : theme.meta.accent };
};

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
