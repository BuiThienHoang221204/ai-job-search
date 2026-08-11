/// Escape văn bản trước khi nhúng vào LaTeX.
///
/// Đây vừa là vấn đề biên dịch vừa là vấn đề an toàn. Văn bản đi vào đây đến
/// từ model, mà model đọc mô tả công việc do người lạ đăng lên. Một chuỗi kiểu
/// `\input{/etc/passwd}` hay `\write18{...}` lọt vào file .tex là lệnh thật khi
/// compile. Escape dấu `\` đầu tiên và biến nó thành \textbackslash sẽ vô hiệu
/// hóa toàn bộ các lệnh như vậy, không còn gì còn là lệnh nữa.
///
/// Thứ tự quan trọng: `\` phải được xử lý trước, nếu không các ký tự thay thế
/// sinh ra ở bước sau lại bị escape lần hai.
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

/// Tên file an toàn cho khóa Storage: bỏ dấu tiếng Việt, chỉ giữ chữ và số.
export const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

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

export type Identity = {
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  title?: string | null;
};

const item = (text: string) => `  \\item ${escapeLatex(text)}`;

/// Sinh CV theo moderncv/banking, dùng khớp template trong cv/main_example.tex.
///
/// CHƯA có bước compile. File .tex được ghi ra Storage; việc chạy lualatex cần
/// container cách ly và sẽ làm ở giai đoạn sau.
export const renderCv = (identity: Identity, content: CvContent): string => {
  const experiences = content.experiences
    .map((experience) =>
      [
        // \needspace chặn tình trạng tiêu đề một công việc nằm lạc loài ở cuối
        // trang còn các gạch đầu dòng tràn sang trang sau.
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
\\title{${escapeLatex(identity.title ?? '')}}
\\address{${escapeLatex(identity.location ?? '')}}{}{}
\\phone[mobile]{${escapeLatex(identity.phone ?? '')}}
\\email{${escapeLatex(identity.email)}}

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

/// Sinh thư xin việc theo cover.cls (XeLaTeX).
export const renderCoverLetter = (
  identity: Identity,
  company: string,
  role: string,
  content: CoverLetterContent,
): string => {
  // Model hay chép lại lời chào vào đầu đoạn mở, khiến thư có hai lời chào liền
  // nhau. Dặn trong prompt không đủ chắc với model yếu, nên cắt ở đây luôn.
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
\\documentclass[11pt,a4paper]{cover}

\\name{${escapeLatex(identity.name)}}
\\email{${escapeLatex(identity.email)}}
\\phone{${escapeLatex(identity.phone ?? '')}}
\\recipient{${escapeLatex(company)}}
\\subjectline{Ứng tuyển vị trí ${escapeLatex(role)}}

\\begin{document}
\\makecovertitle

\\opening{${escapeLatex(content.salutation)}}

\\lettercontent{${body}}

\\closing{Trân trọng,}
\\end{document}
`;
};
