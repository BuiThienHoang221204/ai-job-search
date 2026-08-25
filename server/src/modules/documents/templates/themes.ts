import { printBaseCss } from './html.js';

/**
 * Sáu mẫu CV, khác nhau hoàn toàn bằng CSS. CẢ SÁU ĐỀU MỘT CỘT vì bố cục hai cột
 * làm ATS đọc sai thứ tự dòng - xem CLAUDE.md, mục CV đi đường HTML.
 */

/** Phong cách, dùng để nhóm mẫu ở kho chọn mẫu. */
export type CvTemplateStyle = 'don-gian' | 'chuyen-nghiep' | 'hien-dai';

export type CvTemplateMeta = {
  id: string;
  name: string;
  description: string;
  style: CvTemplateStyle;
  /** Màu nhấn mặc định, dạng `#rrggbb`. */
  accent: string;
  /** Mẫu có dùng màu nhấn hay không. Mẫu đen trắng thì bảng chọn màu phải ẩn đi. */
  usesAccent: boolean;
};

export type CvTheme = {
  meta: CvTemplateMeta;
  css: (accent: string) => string;
};

/**
 * Font phải là font ĐÃ CÀI trong image `pdf-service`: webfont ngoài không tải được,
 * và trang sẽ lặng lẽ rơi về font thay thế mà không báo lỗi.
 */
const SANS = '"Noto Sans", "Liberation Sans", "DejaVu Sans", Arial, sans-serif';
const SERIF =
  '"Noto Serif", "Liberation Serif", "DejaVu Serif", Georgia, serif';

/**
 * CSS nền mọi mẫu đều cần. Cỡ chữ là tham số vì mọi khoảng cách tính theo `em`
 * nên đổi một chỗ là cả mẫu co lại cân đối - đó là cách mẫu "Gọn" hoạt động.
 */
const base = (options: {
  font: string;
  fontSize: string;
  lineHeight: string;
  margin: string;
}): string => `
${printBaseCss}

@page {
  size: A4;
  margin: ${options.margin};
}

/* @page chỉ có tác dụng khi IN. Không có luật này thì khung xem trước dí chữ sát
   mép iframe và trông không giống tờ giấy. Lặp lại đúng lề của @page. */
@media screen {
  body { padding: ${options.margin}; }
}

body {
  font-family: ${options.font};
  font-size: ${options.fontSize};
  line-height: ${options.lineHeight};
  color: #1a1a1a;
}

.section { margin-top: 1.15em; }
.summary { text-align: justify; }

.bullets { list-style: disc; margin-left: 1.3em; }
.bullets li { margin-bottom: 0.15em; }

.entry { margin-bottom: 0.8em; }
.entry:last-child { margin-bottom: 0; }
.entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1em;
}
.entry-role { font-weight: 700; }
/* Không cho khoảng thời gian xuống dòng: "01/2022 -" ở cuối dòng này và "06/2024"
   ở đầu dòng sau đọc như hai mốc rời nhau. */
.entry-period { font-size: 0.9em; color: #555; white-space: nowrap; }
.entry-meta { font-size: 0.95em; color: #333; font-style: italic; margin-bottom: 0.15em; }
.entry-detail { font-size: 0.95em; color: #333; }

.skill-row { display: flex; gap: 0.55em; margin-bottom: 0.25em; }
.skill-label { font-weight: 700; white-space: nowrap; }
`;

const classic: CvTheme = {
  meta: {
    id: 'classic',
    name: 'Tiêu chuẩn',
    description:
      'Tên căn giữa, tiêu đề mục có gạch chân màu. An toàn cho mọi ngành.',
    style: 'chuyen-nghiep',
    // Giữ đúng màu xanh của moderncv để đối chiếu được với bản LaTeX.
    accent: '#3873b3',
    usesAccent: true,
  },
  css: (accent) => `
${base({ font: SANS, fontSize: '10.5pt', lineHeight: '1.45', margin: '14mm 15mm' })}

/* Cỡ đầu trang đã cân lại sau khi đo: bản đầu đẩy một CV thật sang trang 2 với
   đúng một dòng nằm lẻ. */
.cv-header { text-align: center; padding-bottom: 0.35em; }
.cv-name { font-size: 1.95em; font-weight: 700; letter-spacing: 0.02em; color: ${accent}; }
.cv-title { font-size: 1.05em; color: #444; margin-top: 0.15em; }
.cv-contact { font-size: 0.9em; color: #555; margin-top: 0.35em; }

.section-title {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${accent};
  border-bottom: 0.8pt solid ${accent};
  padding-bottom: 0.15em;
  margin-bottom: 0.45em;
}
`,
};

const minimal: CvTheme = {
  meta: {
    id: 'minimal',
    name: 'Tối giản',
    description:
      'Đen trắng, không màu mè. Hợp ngành truyền thống và hồ sơ nhiều chữ.',
    style: 'don-gian',
    accent: '#1a1a1a',
    // Không dùng màu nhấn: giao diện phải ẩn bảng chọn màu đi.
    usesAccent: false,
  },
  css: () => `
${base({ font: SANS, fontSize: '10.5pt', lineHeight: '1.5', margin: '16mm 17mm' })}

.cv-header { padding-bottom: 0.6em; border-bottom: 0.5pt solid #cfcfcf; }
.cv-name { font-size: 1.7em; font-weight: 700; letter-spacing: 0.01em; }
.cv-title { font-size: 1em; color: #555; margin-top: 0.15em; }
.cv-contact { font-size: 0.9em; color: #666; margin-top: 0.4em; }

.section-title {
  font-size: 0.85em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #666;
  margin-bottom: 0.5em;
}
`,
};

const modern: CvTheme = {
  meta: {
    id: 'modern',
    name: 'Hiện đại',
    description: 'Dải màu đậm ở đầu trang, chữ thoáng. Hợp ngành sáng tạo.',
    style: 'hien-dai',
    accent: '#0f766e',
    usesAccent: true,
  },
  css: (accent) => `
${base({ font: SANS, fontSize: '10.5pt', lineHeight: '1.45', margin: '14mm 0 14mm 0' })}

/* Dải màu chạm mép trên tờ giấy, nhưng CHỈ trang đầu: bỏ lề trên ở mọi trang thì
   dòng đầu trang 2 dí sát rìa và máy in cắt mất. Đã đo, Chromium hỗ trợ @page :first. */
@page :first { margin-top: 0; }
@media screen { body { padding-top: 0; } }

.cv-header {
  background: ${accent};
  color: #fff;
  padding: 12mm 15mm 9mm;
  margin-bottom: 1em;
}
.cv-name { font-size: 2em; font-weight: 700; letter-spacing: 0.01em; }
.cv-title { font-size: 1.05em; opacity: 0.92; margin-top: 0.2em; }
.cv-contact { font-size: 0.9em; opacity: 0.85; margin-top: 0.5em; }

.section { padding: 0 15mm; }
.section-title {
  font-size: 1.05em;
  font-weight: 700;
  color: ${accent};
  margin-bottom: 0.5em;
}
`,
};

const accentBar: CvTheme = {
  meta: {
    id: 'thanh-mau',
    name: 'Thanh màu',
    description:
      'Dải màu dọc mép trái, chữ vẫn một cột. Có màu mà máy vẫn đọc đúng.',
    style: 'hien-dai',
    accent: '#b45309',
    usesAccent: true,
  },
  css: (accent) => `
/* Lề trái bằng 0 vì left:0 của phần tử fixed neo vào mép VÙNG NỘI DUNG chứ không
   phải mép giấy; để lề 22mm thì dải màu đè lên đầu mỗi dòng chữ. Bù bằng offset âm
   cũng không được, Chromium cắt mất. Chi tiết trong CLAUDE.md. */
${base({ font: SANS, fontSize: '10.5pt', lineHeight: '1.45', margin: '14mm 15mm 14mm 0' })}

.page-bar {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: 7mm;
  background: ${accent};
}

/* Thụt vào cho khỏi đè lên dải màu. Đặt trên từng khối chứ không trên body:
   padding của body chỉ có tác dụng ở trang đầu và trang cuối. */
.cv-header, .section { padding-left: 22mm; }

.cv-header { padding-bottom: 0.6em; }
.cv-name { font-size: 1.9em; font-weight: 700; color: ${accent}; }
.cv-title { font-size: 1.05em; color: #444; margin-top: 0.2em; }
.cv-contact { font-size: 0.9em; color: #555; margin-top: 0.45em; }

.section-title {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${accent};
  margin-bottom: 0.5em;
}
/* Ô vuông trước tiêu đề mục. content rỗng nên không lọt vào tầng chữ ATS đọc. */
.section-title::before {
  content: "";
  display: inline-block;
  width: 0.42em; height: 0.42em;
  background: ${accent};
  margin-right: 0.5em;
  vertical-align: 0.08em;
}
`,
};

const formal: CvTheme = {
  meta: {
    id: 'trang-trong',
    name: 'Trang trọng',
    description:
      'Chữ có chân, tên căn giữa. Hợp ngân hàng, luật, kế toán, giáo dục.',
    style: 'chuyen-nghiep',
    accent: '#1f3864',
    usesAccent: true,
  },
  css: (accent) => `
${base({ font: SERIF, fontSize: '11pt', lineHeight: '1.4', margin: '16mm 18mm' })}

.cv-header { text-align: center; padding-bottom: 0.5em; border-bottom: 2pt double ${accent}; }
.cv-name { font-size: 1.9em; font-weight: 700; letter-spacing: 0.04em; color: ${accent}; }
.cv-title { font-size: 1em; color: #444; font-style: italic; margin-top: 0.2em; }
.cv-contact { font-size: 0.88em; color: #555; margin-top: 0.4em; }

.section-title {
  font-size: 1em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${accent};
  margin-bottom: 0.45em;
}
.entry-meta { font-style: italic; }
`,
};

const compact: CvTheme = {
  meta: {
    id: 'gon',
    name: 'Gọn',
    description:
      'Chữ nhỏ, lề hẹp. Dồn hồ sơ nhiều kinh nghiệm về vừa một trang.',
    style: 'don-gian',
    accent: '#334155',
    usesAccent: true,
  },
  css: (accent) => `
${base({ font: SANS, fontSize: '9.5pt', lineHeight: '1.32', margin: '11mm 12mm' })}

.cv-header { padding-bottom: 0.4em; border-bottom: 1pt solid ${accent}; }
.cv-name { font-size: 1.7em; font-weight: 700; color: ${accent}; }
.cv-title { font-size: 1em; color: #444; }
.cv-contact { font-size: 0.9em; color: #555; margin-top: 0.25em; }

.section { margin-top: 0.85em; }
.section-title {
  font-size: 0.9em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: ${accent};
  margin-bottom: 0.35em;
}
.entry { margin-bottom: 0.5em; }
`,
};

/** Thứ tự này là thứ tự hiện trong kho chọn mẫu. `classic` đứng đầu: nó là mặc định. */
export const CV_THEMES: readonly CvTheme[] = [
  classic,
  minimal,
  modern,
  accentBar,
  formal,
  compact,
];
