import type {
  CoverLetterContent,
  CvContent,
  Identity,
} from './content.types.js';

/** Escape văn bản trước khi nhúng vào LaTeX. */
export const escapeLatex = (input: string): string =>
  input
    .replace(/\\/g, '\u0000')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    // NUL làm placeholder là có ý: nó không thể xuất hiện trong văn bản thật,
    // nên không bao giờ đụng độ với nội dung người dùng.
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '\\textbackslash{}');

/** Tên file an toàn cho khóa Storage: bỏ dấu tiếng Việt, chỉ giữ chữ và số. */
export const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// Các type nội dung đã chuyển sang `content.types.ts` để module HTML dùng chung mà
// không phải import từ module LaTeX. Xuất lại ở đây để chỗ nào đang import từ
// `latex.js` vẫn chạy nguyên.
export type {
  CoverLetterContent,
  CvContent,
  Identity,
} from './content.types.js';

const item = (text: string) => `  \\item ${escapeLatex(text)}`;

/** Sinh một macro liên hệ, hoặc KHÔNG sinh gì khi không có dữ liệu. */
const contactMacro = (
  macro: string,
  value: string | null | undefined,
  option?: string,
): string => {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  const suffix = option ? `[${option}]` : '';
  return `\\${macro}${suffix}{${escapeLatex(trimmed)}}`;
};

/** Ghép các macro liên hệ, bỏ những cái không có dữ liệu. */
const contactBlock = (lines: string[]): string =>
  lines.filter((line) => line.length > 0).join('\n');

/** Sinh CV theo moderncv/banking, dùng khớp template trong cv/main_example.tex. */
export const renderCv = (identity: Identity, content: CvContent): string => {
  const experiences = content.experiences
    .map((experience) =>
      [
        `\\needspace{5\\baselineskip}`,
        `\\cventry{${escapeLatex(experience.period)}}{${escapeLatex(experience.position)}}{${escapeLatex(experience.company)}}{${escapeLatex(experience.location)}}{}{%`,
        `\\begin{itemize}%`,
        ...experience.bullets.map(item),
        `\\end{itemize}}`,
      ].join('\n'),
    )
    .join('\n\n');

  const educations = content.educations
    .map(
      (education) =>
        `\\cventry{${escapeLatex(education.period)}}{${escapeLatex(education.degree)}}{${escapeLatex(education.institution)}}{}{}{${escapeLatex(education.detail)}}`,
    )
    .join('\n');

  const skills = content.skillGroups
    .map(
      (group) =>
        `\\cvitem{${escapeLatex(group.label)}}{${escapeLatex(group.items.join(', '))}}`,
    )
    .join('\n');

  return `% File này do hệ thống sinh từ dữ liệu hồ sơ. Không sửa trực tiếp:
% lần sinh sau sẽ ghi đè. Sửa hồ sơ hoặc prompt thay vì sửa file.
\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{banking}
\\moderncvcolor{blue}
\\usepackage[utf8]{inputenc}
\\usepackage[scale=0.82]{geometry}
\\usepackage{needspace}

\\name{${escapeLatex(identity.name)}}{}
${contactBlock([
  contactMacro('title', identity.title),
  identity.location?.trim()
    ? `\\address{${escapeLatex(identity.location.trim())}}{}{}`
    : '',
  contactMacro('phone', identity.phone, 'mobile'),
  contactMacro('email', identity.email),
])}

\\begin{document}
\\makecvtitle

\\section{Giới thiệu}
\\cvitem{}{${escapeLatex(content.profileStatement)}}

\\section{Năng lực chính}
\\cvitem{}{%
\\begin{itemize}%
${content.coreCompetencies.map(item).join('\n')}
\\end{itemize}}

\\section{Kinh nghiệm}
${experiences}

\\section{Học vấn}
${educations}

\\section{Kỹ năng}
${skills}

\\end{document}
`;
};

/** Ngày tháng bằng tiếng Việt. */
const vietnameseDate = (now: Date): string =>
  `Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

/** Sinh thư xin việc bằng phần **letter của `moderncv`** (lualatex). */
export const renderCoverLetter = (
  identity: Identity,
  company: string,
  role: string,
  content: CoverLetterContent,
  now: Date = new Date(),
): string => {
  const stripSalutation = (opening: string): string =>
    opening
      .split(/\n+/)
      .filter(
        (line, index) =>
          !(
            index === 0 &&
            /^(k[íi]nh g[uử]i|d(ear|ea)r|th[uư]a)\b/i.test(line.trim())
          ),
      )
      .join('\n\n')
      .trim();

  const body = [
    stripSalutation(content.opening),
    ...content.bodyParagraphs,
    content.motivation,
    content.closing,
  ]
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => escapeLatex(paragraph))
    .join('\n\n');

  return `% File này do hệ thống sinh ra. Không sửa trực tiếp.
% Compile bằng lualatex, giống CV.
\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{banking}
\\moderncvcolor{blue}
\\usepackage[scale=0.82]{geometry}

\\name{${escapeLatex(identity.name)}}{}
${contactBlock([
  identity.location?.trim()
    ? `\\address{${escapeLatex(identity.location.trim())}}{}{}`
    : '',
  contactMacro('phone', identity.phone, 'mobile'),
  contactMacro('email', identity.email),
])}

\\recipient{${escapeLatex(company)}}{}
\\date{${escapeLatex(vietnameseDate(now))}}
\\opening{${escapeLatex(content.salutation)}}
\\closing{Trân trọng,}

\\begin{document}
\\makelettertitle

% Dòng chủ đề nằm trong thân thư, không phải macro riêng: moderncv không có
% \\subjectline, và thêm một macro tự định nghĩa chỉ để in một dòng in đậm là thêm
% một thứ có thể vỡ khi moderncv đổi phiên bản.
\\textbf{Về việc: Ứng tuyển vị trí ${escapeLatex(role)}}

${body}

\\makeletterclosing
\\end{document}
`;
};
