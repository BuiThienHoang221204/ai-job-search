import type { Document, DocumentKind } from '@/generated/prisma/client';
import type { CvContent } from '../content.types';
import type { CvContentResult } from '../schemas/document.schema';
import type { DocumentLanguage } from '../templates/cv-layout';

const PRINTABLE: readonly DocumentKind[] = ['CV', 'COVER_LETTER'];

export const isPrintable = (kind: DocumentKind): boolean =>
  PRINTABLE.includes(kind);

export const renderLanguage = (document: Document): DocumentLanguage =>
  document.language === 'EN' ? 'en' : 'vi';

const hasText = (...parts: Array<string | null | undefined>): boolean =>
  parts.some((part) => (part ?? '').trim().length > 0);

/** Dòng rỗng được lưu nhưng không được vẽ; cả đường HTML lẫn LaTeX đều đi qua đây. */
export const cvContent = (content: unknown): CvContent => {
  const cv = content as CvContentResult;
  return {
    ...cv,
    experiences: cv.experiences
      .map((experience) => ({
        ...experience,
        location: experience.location ?? '',
      }))
      .filter(
        (experience) =>
          hasText(experience.position, experience.company) ||
          experience.bullets.length > 0,
      ),
    projects: (cv.projects ?? [])
      .map((project) => ({
        ...project,
        role: project.role ?? '',
        organization: project.organization ?? '',
        period: project.period ?? '',
        description: project.description ?? '',
        bullets: project.bullets ?? [],
        tools: project.tools ?? [],
      }))
      .filter(
        (project) =>
          hasText(project.name, project.organization) ||
          project.bullets.length > 0,
      ),
    educations: cv.educations
      .map((education) => ({
        ...education,
        period: education.period ?? '',
        detail: education.detail ?? '',
      }))
      .filter((education) => hasText(education.degree, education.institution)),
    skillGroups: cv.skillGroups.filter(
      (group) => hasText(group.label) || group.items.length > 0,
    ),
  };
};
