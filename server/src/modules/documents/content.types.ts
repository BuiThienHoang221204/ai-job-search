/**
 * Hình dạng nội dung tài liệu SAU KHI đã điền giá trị mặc định, dùng chung cho cả
 * hai bên trình bày (LaTeX và HTML). Ràng buộc output của model nằm ở
 * `document.schema.ts`.
 */

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
