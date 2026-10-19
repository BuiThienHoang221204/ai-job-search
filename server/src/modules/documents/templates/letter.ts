import type { CoverLetterContent, Identity } from '../content.types';
import { buildCvHeader } from './body';
import { escapeHtml } from './html';

const SALUTATION = /^(k[íi]nh g[uử]i|dear|th[uư]a)\b/i;

export const letterCss = (accent: string): string => `
.letter-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 2em;
  margin-top: 1.6em;
}
.letter-recipient { font-weight: 700; }
.letter-date { color: #555; white-space: nowrap; }
.letter-subject { margin-top: 1.4em; font-weight: 700; color: ${accent}; }
.letter-salutation { margin-top: 1.1em; }
.letter-body p { margin-top: 0.75em; text-align: justify; }
.letter-sign { margin-top: 1.6em; break-inside: avoid; page-break-inside: avoid; }
.letter-sign-name { margin-top: 2.6em; font-weight: 700; }
`;

const vietnameseDate = (now: Date): string =>
  `Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

function withoutSalutation(opening: string): string {
  const lines = opening.split(/\n+/);
  if (SALUTATION.test(lines[0]?.trim() ?? '')) lines.shift();
  return lines.join('\n').trim();
}

export function buildLetterBody(
  identity: Identity,
  company: string,
  role: string,
  content: CoverLetterContent,
  now: Date,
): string {
  const paragraphs = [
    withoutSalutation(content.opening),
    ...content.bodyParagraphs,
    content.motivation,
    content.closing,
  ]
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`);

  return [
    '<div class="page-bar"></div>',
    buildCvHeader(identity),
    '<div class="letter-meta">',
    `<p class="letter-recipient">${escapeHtml(company)}</p>`,
    `<p class="letter-date">${vietnameseDate(now)}</p>`,
    '</div>',
    `<p class="letter-subject">Về việc: Ứng tuyển vị trí ${escapeHtml(role)}</p>`,
    `<p class="letter-salutation">${escapeHtml(content.salutation)}</p>`,
    `<div class="letter-body">${paragraphs.join('')}</div>`,
    '<div class="letter-sign">',
    '<p>Trân trọng,</p>',
    `<p class="letter-sign-name">${escapeHtml(identity.name)}</p>`,
    '</div>',
  ].join('\n');
}
