import type { CvContent, Identity } from '../content.types';
import {
  DEFAULT_LAYOUT,
  SECTION_TITLES,
  TOOLS_LABEL,
  type CvLayout,
  type DocumentLanguage,
  type SectionKey,
} from './cv-layout';
import { escapeHtml, joinParts } from './html';

const HINTS = {
  summary: 'Giới thiệu ngắn: kinh nghiệm, thế mạnh, mục tiêu',
  competency: 'Một năng lực chính',
  bullet: 'Một việc bạn đã làm và kết quả',
  position: 'Vị trí công việc',
  company: 'Tên công ty',
  location: 'Nơi làm việc',
  period: 'Bắt đầu – Kết thúc',
  project: 'Tên dự án',
  role: 'Vai trò',
  organization: 'Tổ chức / khách hàng',
  description: 'Mô tả ngắn về dự án',
  tools: 'Công cụ, cách nhau bằng dấu phẩy',
  degree: 'Bằng cấp / Ngành học',
  institution: 'Tên trường',
  detail: 'Thành tích, GPA…',
  skillLabel: 'Nhóm kỹ năng',
  skillItems: 'Các kỹ năng, cách nhau bằng dấu phẩy',
  name: 'Họ và tên',
  title: 'Chức danh mong muốn',
  contactLocation: 'Địa chỉ',
  phone: 'Số điện thoại',
  email: 'Email',
};

const fieldAttrs = (editing: boolean, path: string, hint: string): string =>
  editing ? ` data-field="${path}" data-placeholder="${escapeHtml(hint)}"` : '';

const li = (text: string, attrs = ''): string =>
  `<li${attrs}>${escapeHtml(text)}</li>`;

/** Danh sách gạch đầu dòng; ở chế độ sửa luôn có ít nhất một dòng để gõ vào. */
const bullets = (
  items: string[],
  editing: boolean,
  path: string,
  hint: string,
): string => {
  if (!editing) {
    return items.length > 0
      ? `<ul class="bullets">${items.map((item) => li(item)).join('')}</ul>`
      : '';
  }
  const rows = items.length > 0 ? items : [''];
  const lines = rows.map((item, index) =>
    li(item, fieldAttrs(true, `${path}.${index}`, hint)),
  );
  return `<ul class="bullets">${lines.join('')}</ul>`;
};

const section = (
  key: SectionKey,
  title: string,
  defaultTitle: string,
  inner: string,
  editing: boolean,
): string =>
  editing || inner.trim().length > 0
    ? `<section class="section" data-section="${key}"><h2 class="section-title"${fieldAttrs(editing, `layout.titles.${key}`, defaultTitle)}>${escapeHtml(title)}</h2><div class="section-body">${inner}</div></section>`
    : '';

const entryHead = (
  title: string,
  period: string,
  editing: boolean,
  path: string,
  titleKey: string,
  titleHint: string,
): string =>
  [
    '<div class="entry-head">',
    `<span class="entry-role"${fieldAttrs(editing, `${path}.${titleKey}`, titleHint)}>${escapeHtml(title)}</span>`,
    editing || period.trim()
      ? `<span class="entry-period"${fieldAttrs(editing, `${path}.period`, HINTS.period)}>${escapeHtml(period)}</span>`
      : '',
    '</div>',
  ].join('');

const metaLine = (
  first: { path: string; value: string; hint: string },
  second: { path: string; value: string; hint: string },
  editing: boolean,
): string => {
  if (editing) {
    const one = `<span${fieldAttrs(true, first.path, first.hint)}>${escapeHtml(first.value)}</span>`;
    const two = `<span${fieldAttrs(true, second.path, second.hint)}>${escapeHtml(second.value)}</span>`;
    return `<div class="entry-meta">${one} · ${two}</div>`;
  }
  const meta = joinParts([first.value, second.value]);
  return meta ? `<div class="entry-meta">${escapeHtml(meta)}</div>` : '';
};

const detailLine = (
  value: string,
  editing: boolean,
  path: string,
  hint: string,
): string =>
  editing || value.trim()
    ? `<div class="entry-detail"${fieldAttrs(editing, path, hint)}>${escapeHtml(value)}</div>`
    : '';

const experienceEntry = (
  experience: CvContent['experiences'][number],
  index: number,
  editing: boolean,
): string => {
  const path = `experiences.${index}`;
  return [
    `<article class="entry"${editing ? ` data-entry="${path}"` : ''}>`,
    entryHead(
      experience.position,
      experience.period,
      editing,
      path,
      'position',
      HINTS.position,
    ),
    metaLine(
      {
        path: `${path}.company`,
        value: experience.company,
        hint: HINTS.company,
      },
      {
        path: `${path}.location`,
        value: experience.location,
        hint: HINTS.location,
      },
      editing,
    ),
    bullets(experience.bullets, editing, `${path}.bullets`, HINTS.bullet),
    '</article>',
  ].join('');
};

const projectEntry = (
  project: CvContent['projects'][number],
  index: number,
  language: DocumentLanguage,
  editing: boolean,
): string => {
  const path = `projects.${index}`;
  const toolList = escapeHtml(project.tools.join(', '));
  let tools = '';
  if (editing) {
    tools = `<div class="entry-detail">${TOOLS_LABEL[language]}: <span${fieldAttrs(true, `${path}.tools`, HINTS.tools)}>${toolList}</span></div>`;
  } else if (project.tools.length > 0) {
    tools = `<div class="entry-detail">${TOOLS_LABEL[language]}: ${toolList}</div>`;
  }
  return [
    `<article class="entry"${editing ? ` data-entry="${path}"` : ''}>`,
    entryHead(
      project.name,
      project.period,
      editing,
      path,
      'name',
      HINTS.project,
    ),
    metaLine(
      { path: `${path}.role`, value: project.role, hint: HINTS.role },
      {
        path: `${path}.organization`,
        value: project.organization,
        hint: HINTS.organization,
      },
      editing,
    ),
    detailLine(
      project.description,
      editing,
      `${path}.description`,
      HINTS.description,
    ),
    bullets(project.bullets, editing, `${path}.bullets`, HINTS.bullet),
    tools,
    '</article>',
  ].join('');
};

const educationEntry = (
  education: CvContent['educations'][number],
  index: number,
  editing: boolean,
): string => {
  const path = `educations.${index}`;
  return [
    `<article class="entry"${editing ? ` data-entry="${path}"` : ''}>`,
    entryHead(
      education.degree,
      education.period,
      editing,
      path,
      'degree',
      HINTS.degree,
    ),
    editing || education.institution.trim()
      ? `<div class="entry-meta"${fieldAttrs(editing, `${path}.institution`, HINTS.institution)}>${escapeHtml(education.institution)}</div>`
      : '',
    detailLine(education.detail, editing, `${path}.detail`, HINTS.detail),
    '</article>',
  ].join('');
};

const skillRow = (
  group: CvContent['skillGroups'][number],
  index: number,
  editing: boolean,
): string => {
  const items = escapeHtml(group.items.join(', '));
  if (!editing) {
    return `<div class="skill-row"><span class="skill-label">${escapeHtml(group.label)}:</span><span class="skill-items">${items}</span></div>`;
  }
  const path = `skillGroups.${index}`;
  return `<div class="skill-row" data-entry="${path}"><span class="skill-label"${fieldAttrs(true, `${path}.label`, HINTS.skillLabel)}>${escapeHtml(group.label)}</span>:<span class="skill-items"${fieldAttrs(true, `${path}.items`, HINTS.skillItems)}>${items}</span></div>`;
};

const headerCell = (
  key: string,
  value: string | null | undefined,
  hint: string,
): string =>
  `<span${fieldAttrs(true, `identity.${key}`, hint)}>${escapeHtml(value ?? '')}</span>`;

/** Phần đầu CV: tên, chức danh, liên hệ. Ở chế độ sửa mỗi thông tin là một ô riêng, kể cả ô trống. */
export const buildCvHeader = (identity: Identity, editing = false): string => {
  if (editing) {
    return [
      '<header class="cv-header">',
      `<h1 class="cv-name"${fieldAttrs(true, 'identity.name', HINTS.name)}>${escapeHtml(identity.name)}</h1>`,
      `<p class="cv-title">${headerCell('title', identity.title, HINTS.title)}</p>`,
      `<p class="cv-contact">${headerCell('location', identity.location, HINTS.contactLocation)} · ${headerCell('phone', identity.phone, HINTS.phone)} · ${headerCell('email', identity.email, HINTS.email)}</p>`,
      '</header>',
    ].join('');
  }

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

const sectionBody = (
  content: CvContent,
  language: DocumentLanguage,
  editing: boolean,
): Record<SectionKey, string> => ({
  profile:
    editing || content.profileStatement.trim()
      ? `<p class="summary"${fieldAttrs(editing, 'profileStatement', HINTS.summary)}>${escapeHtml(content.profileStatement)}</p>`
      : '',
  competencies: bullets(
    content.coreCompetencies,
    editing,
    'coreCompetencies',
    HINTS.competency,
  ),
  experience: content.experiences
    .map((experience, index) => experienceEntry(experience, index, editing))
    .join(''),
  projects: content.projects
    .map((project, index) => projectEntry(project, index, language, editing))
    .join(''),
  education: content.educations
    .map((education, index) => educationEntry(education, index, editing))
    .join(''),
  skills: content.skillGroups
    .map((group, index) => skillRow(group, index, editing))
    .join(''),
});

/** Các mục của CV. `editing` gắn địa chỉ trường và vẽ cả ô trống để trang cha cho sửa tại chỗ; bản in không bao giờ bật nó. */
export const buildCvSections = (
  content: CvContent,
  layout: CvLayout = DEFAULT_LAYOUT,
  language: DocumentLanguage = 'vi',
  editing = false,
): string => {
  const bodies = sectionBody(content, language, editing);
  const titles = SECTION_TITLES[language];

  return layout.order
    .filter((key) => !layout.hidden.includes(key))
    .map((key) =>
      section(
        key,
        layout.titles?.[key] ?? titles[key],
        titles[key],
        bodies[key],
        editing,
      ),
    )
    .join('\n');
};
