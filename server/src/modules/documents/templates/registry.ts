import type { CoverLetterContent, CvContent, Identity } from '../content.types';
import { buildCvHeader, buildCvSections } from './body';
import { resolveLayout, type DocumentLanguage } from './cv-layout';
import { htmlDocument } from './html';
import { buildLetterBody, letterCss } from './letter';
import { CV_THEMES, type CvTemplateMeta, type CvTheme } from './themes';
import {
  resolveTypography,
  typographyCss,
  type CvTypography,
} from './typography';

export const DEFAULT_TEMPLATE_ID = 'classic';

export type CvTemplateOptions = CvTypography & {
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
  const typography = resolveTypography(raw);
  if (!theme.meta.usesAccent)
    return { ...typography, accent: theme.meta.accent };

  const accent = (raw as { accent?: unknown } | null)?.accent;
  return {
    ...typography,
    accent: isAccent(accent) ? accent : theme.meta.accent,
  };
};

export const renderCvHtml = (
  identity: Identity,
  content: CvContent,
  templateId: string | null | undefined = DEFAULT_TEMPLATE_ID,
  rawOptions: unknown = null,
  rawLayout: unknown = null,
  language: DocumentLanguage = 'vi',
  editing = false,
): string => {
  const theme = findTheme(templateId);
  const options = resolveTemplateOptions(templateId, rawOptions);
  const layout = resolveLayout(rawLayout);

  const body = [
    '<div class="page-bar"></div>',
    buildCvHeader(identity, editing),
    buildCvSections(content, layout, language, editing),
  ].join('\n');

  return htmlDocument({
    title: `${identity.name} - CV`,
    css: theme.css(options.accent) + typographyCss(options, theme.fontPt),
    body,
  });
};

export const renderLetterHtml = (
  identity: Identity,
  company: string,
  role: string,
  content: CoverLetterContent,
  templateId: string | null | undefined = DEFAULT_TEMPLATE_ID,
  rawOptions: unknown = null,
  now: Date = new Date(),
): string => {
  const theme = findTheme(templateId);
  const options = resolveTemplateOptions(templateId, rawOptions);

  return htmlDocument({
    title: `${identity.name} - Thư xin việc`,
    css:
      theme.css(options.accent) +
      letterCss(options.accent) +
      typographyCss(options, theme.fontPt),
    body: buildLetterBody(identity, company, role, content, now),
  });
};
