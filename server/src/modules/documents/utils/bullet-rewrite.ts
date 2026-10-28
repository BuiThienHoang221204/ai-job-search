import { LANGUAGE_RULE, type OutputLanguage } from '@/common/model-output';
import { NUMBER_HOLE, holeUnknownNumbers } from '@/common/text/number-holes';

export const BULLET_REWRITE_TIMEOUT_MS = 60_000;

const LEAD = /dẫn dắt|trưởng nhóm|lãnh đạo|team lead|led (a|the) team/i;

export const REWRITE_KINDS = [
  'experience',
  'project',
  'profile',
  'description',
  'competency',
  'headline',
] as const;

export type RewriteKind = (typeof REWRITE_KINDS)[number];

export type BulletInput = {
  kind: RewriteKind;
  text: string;
  context: string;
};

export const REWRITE_MAX_CHARS: Record<RewriteKind, number> = {
  experience: 260,
  project: 260,
  profile: 700,
  description: 500,
  competency: 160,
  headline: 140,
};

const MIN_WORDS: Record<RewriteKind, number> = {
  experience: 4,
  project: 4,
  profile: 4,
  description: 4,
  competency: 1,
  headline: 1,
};

const STAR_SHAPE =
  'theo công thức STAR/CAR: động từ hành động, việc đã làm, công cụ, kết quả. Mỗi cách một câu, tối đa 35 chữ.';

const TASK: Record<RewriteKind, string> = {
  experience: `Bạn viết lại MỘT gạch đầu dòng trong mục Kinh nghiệm của CV ${STAR_SHAPE}`,
  project: `Bạn viết lại MỘT gạch đầu dòng trong mục Dự án của CV ${STAR_SHAPE}`,
  profile:
    'Bạn viết lại đoạn giới thiệu đầu CV cho đúng vị trí đang nhắm: 2-4 câu, nói người này làm gì, mạnh ở đâu, hợp tin ở điểm nào. Giữ nguyên số năm kinh nghiệm, tên công ty và khách hàng đã có trong đoạn gốc; không thêm số năm, thành tích hay chứng chỉ mới.',
  description:
    'Bạn viết lại đoạn mô tả MỘT dự án trong CV: 1-3 câu, nói dự án làm gì, cho ai dùng, quy mô ra sao. Giữ nguyên tên khách hàng và số liệu đã có trong đoạn gốc; không thêm khách hàng, quy mô hay số liệu mới.',
  competency:
    'Bạn viết lại MỘT dòng trong mục Năng lực chính của CV: tên năng lực, rồi một vế ngắn nói nó giúp gì cho vị trí đang nhắm. Tối đa 20 chữ.',
  headline:
    'Bạn viết lại dòng chức danh ngay dưới tên trong CV: một dòng tối đa 12 chữ, gồm chức danh khớp tin và thế mạnh chính. Giữ nguyên số năm kinh nghiệm nếu dòng gốc có; không thêm số năm mới.',
};

export type BulletFacts = {
  profileSkills: string[];
  jobSkills: string[];
  jobTitle: string | null;
};

export type BulletSuggestion = {
  text: string;
  keywords: string[];
};

type SkillRows = {
  profile: { primarySkills: string[]; secondarySkills: string[] } | null;
  requirements: { requiredSkills: string[]; niceToHaveSkills: string[] } | null;
  jobTitle: string | null;
};

export function bulletFacts({
  profile,
  requirements,
  jobTitle,
}: SkillRows): BulletFacts {
  return {
    profileSkills: [
      ...(profile?.primarySkills ?? []),
      ...(profile?.secondarySkills ?? []),
    ],
    jobSkills: [
      ...(requirements?.requiredSkills ?? []),
      ...(requirements?.niceToHaveSkills ?? []),
    ],
    jobTitle,
  };
}

export function tooVague(kind: RewriteKind, text: string): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length < MIN_WORDS[kind];
}

function mentions(text: string, term: string): boolean {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    'iu',
  ).test(text);
}

export function bulletRewritePrompt(
  input: BulletInput,
  facts: BulletFacts,
  language: OutputLanguage,
): { system: string; prompt: string } {
  const system = [
    TASK[input.kind],
    'Quy tắc không được phá:',
    '- Chỉ dùng sự kiện có trong dòng gốc. Không thêm việc, dự án, khách hàng hay vai trò mới.',
    `- KHÔNG tự đặt con số. Chỗ cần số liệu kết quả thì viết đúng ${NUMBER_HOLE} để người dùng tự điền, ví dụ "giảm thời gian phản hồi ${NUMBER_HOLE}%". Số đã có trong dòng gốc thì giữ nguyên.`,
    '- Chỉ nhắc kỹ năng, công cụ nằm trong "Kỹ năng trong hồ sơ" hoặc đã có trong dòng gốc.',
    '- Kỹ năng nào vừa có trong hồ sơ vừa là từ khoá của tin thì dùng đúng chữ của tin.',
    '- Không nâng vai trò (dẫn dắt, trưởng nhóm, lãnh đạo) nếu dòng gốc không nói vậy.',
    '- Các cách khác nhau về trọng tâm.',
    '- Dòng gốc quá mơ hồ để viết lại mà không bịa thì trả mảng rỗng.',
    `- ${LANGUAGE_RULE[language]}`,
  ].join('\n');

  const prompt = [
    `Dòng gốc: ${input.text}`,
    `Ngữ cảnh: ${input.context || 'không ghi'}`,
    `Kỹ năng trong hồ sơ: ${facts.profileSkills.join(', ') || 'không có'}`,
    facts.jobTitle
      ? `Tin đang nhắm: ${facts.jobTitle}`
      : 'CV không nhắm tin nào.',
    `Từ khoá của tin: ${facts.jobSkills.join(', ') || 'không có'}`,
  ].join('\n');

  return { system, prompt };
}

export function guardSuggestions(
  suggestions: string[],
  original: string,
  facts: BulletFacts,
): BulletSuggestion[] {
  const known = [original, ...facts.profileSkills, ...facts.jobSkills].join(
    ' ',
  );
  const foreign = facts.jobSkills.filter(
    (skill) =>
      !mentions(original, skill) &&
      !facts.profileSkills.some(
        (own) => own.toLowerCase() === skill.toLowerCase(),
      ),
  );
  const originalLeads = LEAD.test(original);

  const kept: BulletSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (foreign.some((skill) => mentions(suggestion, skill))) continue;
    if (!originalLeads && LEAD.test(suggestion)) continue;

    const text = holeUnknownNumbers(suggestion, known);
    kept.push({
      text,
      keywords: facts.jobSkills.filter((skill) => mentions(text, skill)),
    });
  }
  return kept;
}
