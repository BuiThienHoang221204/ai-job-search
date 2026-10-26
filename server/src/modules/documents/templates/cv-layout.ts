export const SECTION_KEYS = [
  'profile',
  'competencies',
  'experience',
  'projects',
  'education',
  'skills',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export type DocumentLanguage = 'vi' | 'en';

export const TOOLS_LABEL: Record<DocumentLanguage, string> = {
  vi: 'Công cụ',
  en: 'Tools',
};

export const SECTION_TITLES: Record<
  DocumentLanguage,
  Record<SectionKey, string>
> = {
  vi: {
    profile: 'Giới thiệu',
    competencies: 'Năng lực chính',
    experience: 'Kinh nghiệm',
    projects: 'Dự án',
    education: 'Học vấn',
    skills: 'Kỹ năng',
  },
  en: {
    profile: 'Profile',
    competencies: 'Core Competencies',
    experience: 'Professional Experience',
    projects: 'Projects',
    education: 'Education',
    skills: 'Skills',
  },
};

export const SECTION_TITLE_MAX = 60;

export type CvLayout = {
  order: SectionKey[];
  hidden: SectionKey[];
  titles?: Partial<Record<SectionKey, string>>;
};

export const DEFAULT_LAYOUT: CvLayout = {
  order: [...SECTION_KEYS],
  hidden: [],
  titles: {},
};

const isSectionKey = (value: unknown): value is SectionKey =>
  typeof value === 'string' && SECTION_KEYS.includes(value as SectionKey);

const cleanKeys = (raw: unknown): SectionKey[] =>
  Array.isArray(raw) ? [...new Set(raw.filter(isSectionKey))] : [];

const cleanTitles = (raw: unknown): Partial<Record<SectionKey, string>> => {
  const titles: Partial<Record<SectionKey, string>> = {};
  if (!raw || typeof raw !== 'object') return titles;
  for (const [key, value] of Object.entries(raw)) {
    if (!isSectionKey(key) || typeof value !== 'string') continue;
    const title = value.trim();
    if (title) titles[key] = title;
  }
  return titles;
};

/** Khoá mục thiếu được nối vào cuối, nên thêm mục ở bản sau không làm CV cũ mất mục. */
export const resolveLayout = (raw: unknown): CvLayout => {
  const stored = (raw ?? {}) as {
    order?: unknown;
    hidden?: unknown;
    titles?: unknown;
  };
  const order = cleanKeys(stored.order);
  const missing = SECTION_KEYS.filter((key) => !order.includes(key));

  return {
    order: [...order, ...missing],
    hidden: cleanKeys(stored.hidden),
    titles: cleanTitles(stored.titles),
  };
};
