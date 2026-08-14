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

/**
 * Sinh một macro liên hệ, hoặc KHÔNG sinh gì khi không có dữ liệu.
 *
 * Vì sao cần: `\phone[mobile]{}` với giá trị rỗng vẫn vẽ icon fontawesome, và tên
 * icon lọt vào **lớp text** của PDF. Đã đo trên bản compile thật rồi đọc ngược bằng
 * `pdf-parse`: dòng liên hệ ra thành
 *
 *   "MOBILE-ANDROID-ALT • 🖂 admin@aijob.local"
 *
 * ATS đọc chính lớp text đó, nên một hồ sơ không có số điện thoại lại mang theo
 * chuỗi rác `MOBILE-ANDROID-ALT` giữa phần thông tin liên hệ. Exit code của lualatex
 * là 0 và không có cảnh báo nào — lỗi này chỉ lộ ra khi đọc lại PDF đã sinh.
 *
 * Trả về chuỗi rỗng thay vì macro, và caller lọc dòng rỗng đi.
 */
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

/// Ghép các macro liên hệ, bỏ những cái không có dữ liệu.
const contactBlock = (lines: string[]): string =>
  lines.filter((line) => line.length > 0).join('\n');

/// Sinh CV theo moderncv/banking, dùng khớp template trong cv/main_example.tex.
///
/// Compile bằng **lualatex**. `moderncv` nằm sẵn trong TeX Live nên template này
/// không cần tài sản ngoài nào.
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

/**
 * Ngày tháng bằng tiếng Việt.
 *
 * KHÔNG dùng `\today` của LaTeX: nó theo ngôn ngữ của document class, và `moderncv`
 * mặc định là tiếng Anh — thư tiếng Việt sẽ mang dòng "August 13, 2026". Đã thấy
 * đúng như vậy trên bản compile thử.
 *
 * Cũng không nạp `babel` với `vietnamese` chỉ để lấy một dòng ngày: babel đổi cả
 * cách chia từ (hyphenation) và tên các mục, tức là đổi thứ đang chạy tốt để giải
 * một việc mà một dòng chuỗi là đủ.
 */
const vietnameseDate = (now: Date): string =>
  `Ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;

/**
 * Sinh thư xin việc bằng phần **letter của `moderncv`** (lualatex).
 *
 * Trước đây dùng `cover.cls` của bản fork, và nó KHÔNG dùng được cho tiếng Việt:
 * font Lato/Raleway đi kèm thiếu 21 mã ký tự riêng của tiếng Việt (`ạ` U+1EA1,
 * `ơ` U+01A1, `ư` U+01B0, `ế`, `ệ`, `ậ`…). Bản fork viết cho tiếng Đan Mạch, nơi Lato
 * phủ `æøå` thừa sức.
 *
 * Hệ quả đã thấy trên bản compile thật: chữ Việt **biến mất khỏi trang giấy**, không
 * chỉ khỏi lớp text — "ứng tuyển" ra thành "ng tuyn", "quản trị hệ thống" thành
 * "qun tr h thng". PDF vẫn ra 1 trang và exit code vẫn 0.
 *
 * Đổi sang `moderncv` được ba thứ cùng lúc: tiếng Việt sạch (0 glyph thiếu, đã đo),
 * thư xin việc trông cùng một bộ với CV, và hệ thống bớt hẳn một engine (`xelatex`)
 * cùng 1,7MB font nhúng.
 */
export const renderCoverLetter = (
  identity: Identity,
  company: string,
  role: string,
  content: CoverLetterContent,
  now: Date = new Date(),
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
