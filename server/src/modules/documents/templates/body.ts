import type { CvContent, Identity } from '../content.types.js';
import {
  DEFAULT_LAYOUT,
  SECTION_TITLES,
  TOOLS_LABEL,
  type CvLayout,
  type DocumentLanguage,
  type SectionKey,
} from './cv-layout.js';
import { escapeHtml, joinParts } from './html.js';

/**
 * Đánh dấu ngữ nghĩa của CV, DÙNG CHUNG cho mọi mẫu - mẫu chỉ khác nhau bằng CSS.
 * Nhờ vậy đổi mẫu không đổi thứ tự chữ mà ATS đọc. Lý do đầy đủ trong CLAUDE.md.
 */

const li = (text: string): string => `<li>${escapeHtml(text)}</li>`;

/** Danh sách gạch đầu dòng, hoặc chuỗi rỗng khi không có mục nào. */
const bullets = (items: string[]): string =>
  items.length > 0 ? `<ul class="bullets">${items.map(li).join('')}</ul>` : '';

/** Vẽ một mục, hoặc KHÔNG vẽ gì khi rỗng: tiêu đề trên khoảng trắng đọc như mất dữ liệu. */
const section = (key: SectionKey, title: string, inner: string): string =>
  inner.trim().length > 0
    ? `<section class="section" data-section="${key}"><h2 class="section-title">${escapeHtml(title)}</h2><div class="section-body">${inner}</div></section>`
    : '';

/** Dòng đầu một mục: nhan đề trước, khoảng thời gian sau - kể cả khi CSS đẩy nó sang phải. */
const entryHead = (title: string, period: string): string =>
  [
    '<div class="entry-head">',
    `<span class="entry-role">${escapeHtml(title)}</span>`,
    period.trim()
      ? `<span class="entry-period">${escapeHtml(period)}</span>`
      : '',
    '</div>',
  ].join('');

/** Một mục kinh nghiệm làm việc. */
const experienceEntry = (
  experience: CvContent['experiences'][number],
): string => {
  const meta = joinParts([experience.company, experience.location]);
  return [
    '<article class="entry">',
    entryHead(experience.position, experience.period),
    meta ? `<div class="entry-meta">${escapeHtml(meta)}</div>` : '',
    bullets(experience.bullets),
    '</article>',
  ].join('');
};

const projectEntry = (
  project: CvContent['projects'][number],
  language: DocumentLanguage,
): string => {
  const meta = joinParts([project.role, project.organization]);
  return [
    '<article class="entry">',
    entryHead(project.name, project.period),
    meta ? `<div class="entry-meta">${escapeHtml(meta)}</div>` : '',
    project.description.trim()
      ? `<div class="entry-detail">${escapeHtml(project.description)}</div>`
      : '',
    bullets(project.bullets),
    project.tools.length > 0
      ? `<div class="entry-detail">${TOOLS_LABEL[language]}: ${escapeHtml(project.tools.join(', '))}</div>`
      : '',
    '</article>',
  ].join('');
};

/** Một mục học vấn. */
const educationEntry = (education: CvContent['educations'][number]): string =>
  [
    '<article class="entry">',
    entryHead(education.degree, education.period),
    education.institution.trim()
      ? `<div class="entry-meta">${escapeHtml(education.institution)}</div>`
      : '',
    education.detail.trim()
      ? `<div class="entry-detail">${escapeHtml(education.detail)}</div>`
      : '',
    '</article>',
  ].join('');

/** Một nhóm kỹ năng. */
const skillRow = (group: CvContent['skillGroups'][number]): string =>
  `<div class="skill-row"><span class="skill-label">${escapeHtml(group.label)}:</span><span class="skill-items">${escapeHtml(group.items.join(', '))}</span></div>`;

/** Phần đầu trang: tên, chức danh, dòng liên hệ. */
export const buildCvHeader = (identity: Identity): string => {
  const contact = joinParts([
    identity.location,
    identity.phone,
    identity.email,
  ]);

  return [
    '<header class="cv-header">',
    `<h1 class="cv-name">${escapeHtml(identity.name)}</h1>`,
    identity.title?.trim()
      ? `<p class="cv-title">${escapeHtml(identity.title.trim())}</p>`
      : '',
    contact ? `<p class="cv-contact">${escapeHtml(contact)}</p>` : '',
    '</header>',
  ].join('');
};

/** Phần thân của từng mục, chưa gắn tiêu đề và chưa xét thứ tự. */
const sectionBody = (
  content: CvContent,
  language: DocumentLanguage,
): Record<SectionKey, string> => ({
  profile: content.profileStatement.trim()
    ? `<p class="summary">${escapeHtml(content.profileStatement)}</p>`
    : '',
  competencies: bullets(content.coreCompetencies),
  experience: content.experiences.map(experienceEntry).join(''),
  projects: content.projects
    .map((project) => projectEntry(project, language))
    .join(''),
  education: content.educations.map(educationEntry).join(''),
  skills: content.skillGroups.map(skillRow).join(''),
});

/**
 * Các mục nội dung, theo thứ tự người dùng chọn và bỏ mục họ ẩn.
 *
 * Mục ẩn KHÔNG được vẽ rồi giấu bằng CSS: ATS đọc tầng chữ chứ không đọc CSS, nên
 * `display: none` vẫn để nội dung lọt vào bản mà máy đọc.
 */
export const buildCvSections = (
  content: CvContent,
  layout: CvLayout = DEFAULT_LAYOUT,
  language: DocumentLanguage = 'vi',
): string => {
  const bodies = sectionBody(content, language);
  const titles = SECTION_TITLES[language];

  return layout.order
    .filter((key) => !layout.hidden.includes(key))
    .map((key) => section(key, titles[key], bodies[key]))
    .join('\n');
};
