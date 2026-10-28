import { holeUnknownNumbers } from '@/common/text/number-holes';
import type { CvReviewOutput } from '../cv-check.schema';
import { normalizeText } from './cv-lines';
import { EMAIL, PHONE } from './cv-score';

export const REVIEW_SECTIONS = [
  'contact',
  'summary',
  'experience',
  'projects',
  'skills',
  'education',
  'certifications',
] as const;

export const ATS_CHECKS = [
  'readingOrder',
  'headings',
  'dates',
  'jobTitles',
  'spelling',
] as const;

type ReviewSection = (typeof REVIEW_SECTIONS)[number];
type AtsCheck = (typeof ATS_CHECKS)[number];

export type CvReviewIssue = {
  title: string;
  impact: 'ats' | 'recruiter' | 'both';
  why: string;
  quote: string | null;
  rewrite: string | null;
};

export type CvReview = {
  summary: string;
  targetRole: string;
  level: CvReviewOutput['level'];
  sections: Array<{
    section: ReviewSection;
    verdict: 'ok' | 'fix' | 'missing';
    note: string;
    issues: CvReviewIssue[];
  }>;
  ats: Array<{ key: AtsCheck; status: 'pass' | 'warn' | 'fail'; note: string }>;
  strengths: string[];
  improvements: string[];
  questions: CvReviewOutput['questions'];
  parsed: {
    name: string | null;
    email: string | null;
    phone: string | null;
    jobs: CvReviewOutput['jobs'];
    education: CvReviewOutput['education'];
    skills: string[];
  };
};

const QUOTE_MARKS = /^["“”'‘’]+|["“”'‘’]+$/g;

const verbatim = (value: string | null, haystack: string) =>
  value && haystack.includes(normalizeText(value)) ? value : null;

/** Giữ nhận xét của model trong khuôn: bỏ ý có câu trích không có thật trong CV, đục số tự đặt trong câu viết mẫu, gộp mục trùng, xếp mục theo thứ tự cố định; trường máy lọc tách ra chỉ giữ chữ có nguyên văn trong CV, email và số điện thoại đọc bằng code. */
export function verifyReview(output: CvReviewOutput, text: string): CvReview {
  const haystack = normalizeText(text);
  const sections: CvReview['sections'] = [];
  for (const part of output.review) {
    if (part.section === 'other') continue;
    if (sections.some((kept) => kept.section === part.section)) continue;

    const issues: CvReviewIssue[] = [];
    for (const issue of part.issues) {
      const quote = issue.quote?.replace(QUOTE_MARKS, '').trim() || null;
      if (quote && !haystack.includes(normalizeText(quote))) continue;
      let rewrite: string | null = null;
      if (quote && issue.rewrite)
        rewrite = holeUnknownNumbers(issue.rewrite, quote);
      issues.push({ ...issue, quote, rewrite });
    }
    sections.push({ ...part, section: part.section, issues });
  }
  sections.sort(
    (a, b) =>
      REVIEW_SECTIONS.indexOf(a.section) - REVIEW_SECTIONS.indexOf(b.section),
  );

  const ats: CvReview['ats'] = [];
  for (const item of output.ats) {
    if (item.key === 'other') continue;
    if (ats.some((kept) => kept.key === item.key)) continue;
    ats.push({ ...item, key: item.key });
  }
  ats.sort((a, b) => ATS_CHECKS.indexOf(a.key) - ATS_CHECKS.indexOf(b.key));

  return {
    summary: output.summary,
    targetRole: output.targetRole,
    level: output.level,
    sections,
    ats,
    strengths: output.strengths,
    improvements: output.improvements,
    questions: output.questions,
    parsed: {
      name: verbatim(output.name, haystack),
      email: EMAIL.exec(text)?.[0] ?? null,
      phone: PHONE.exec(text)?.[0].trim() ?? null,
      jobs: output.jobs
        .filter((job) => verbatim(job.title, haystack))
        .map((job) => ({
          title: job.title,
          company: verbatim(job.company, haystack),
          dates: verbatim(job.dates, haystack),
        })),
      education: output.education
        .filter((item) => verbatim(item.school, haystack))
        .map((item) => ({
          school: item.school,
          degree: verbatim(item.degree, haystack),
          dates: verbatim(item.dates, haystack),
        })),
      skills: output.skills.filter((skill) => verbatim(skill, haystack)),
    },
  };
}
