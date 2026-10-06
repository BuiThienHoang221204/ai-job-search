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

const li = (text: string): string => `<li>${escapeHtml(text)}</li>`;

const bullets = (items: string[]): string =>
  items.length > 0 ? `<ul class="bullets">${items.map(li).join('')}</ul>` : '';

const section = (key: SectionKey, title: string, inner: string): string =>
  inner.trim().length > 0
    ? `<section class="section" data-section="${key}"><h2 class="section-title">${escapeHtml(title)}</h2><div class="section-body">${inner}</div></section>`
    : '';

const entryHead = (title: string, period: string): string =>
  [
    '<div class="entry-head">',
    `<span class="entry-role">${escapeHtml(title)}</span>`,
    period.trim()
      ? `<span class="entry-period">${escapeHtml(period)}</span>`
      : '',
    '</div>',
  ].join('');

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

const skillRow = (group: CvContent['skillGroups'][number]): string =>
  `<div class="skill-row"><span class="skill-label">${escapeHtml(group.label)}:</span><span class="skill-items">${escapeHtml(group.items.join(', '))}</span></div>`;

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
