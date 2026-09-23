/** Nội dung SAU KHI điền mặc định, dùng chung cho LaTeX và HTML; ràng buộc model nằm ở `schemas/document.schema.ts`. */

export type CvContent = {
  profileStatement: string;
  coreCompetencies: string[];
  experiences: Array<{
    position: string;
    company: string;
    location: string;
    period: string;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    role: string;
    organization: string;
    period: string;
    description: string;
    bullets: string[];
    tools: string[];
  }>;
  educations: Array<{
    degree: string;
    institution: string;
    period: string;
    detail: string;
  }>;
  skillGroups: Array<{ label: string; items: string[] }>;
};

export type CoverLetterContent = {
  salutation: string;
  opening: string;
  bodyParagraphs: string[];
  motivation: string;
  closing: string;
};

/** Thông tin liên hệ, ghép từ `User` và `Profile` chứ không do model sinh. */
export type Identity = {
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  title?: string | null;
};
