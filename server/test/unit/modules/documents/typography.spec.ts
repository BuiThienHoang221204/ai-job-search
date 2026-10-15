import type {
  CvContent,
  Identity,
} from 'src/modules/documents/content.types.js';
import { renderCvHtml } from 'src/modules/documents/templates/registry.js';
import { CV_THEMES } from 'src/modules/documents/templates/themes.js';
import {
  resolveTypography,
  typographyCss,
} from 'src/modules/documents/templates/typography.js';

const identity: Identity = { name: 'An', email: 'an@example.com' };
const content: CvContent = {
  profileStatement: 'Kế toán.',
  coreCompetencies: [],
  experiences: [],
  projects: [],
  educations: [],
  skillGroups: [],
};

describe('resolveTypography', () => {
  test('giá trị hợp lệ được giữ', () => {
    expect(
      resolveTypography({ font: 'times', size: 'large', lineHeight: 1.65 }),
    ).toEqual({ font: 'times', size: 'large', lineHeight: 1.65 });
  });

  test('giá trị hỏng quay về mặc định của mẫu', () => {
    expect(
      resolveTypography({ font: 'comic-sans', size: 'huge', lineHeight: 3 }),
    ).toEqual({ font: undefined, size: undefined, lineHeight: undefined });
    expect(resolveTypography({ size: 'medium' }).size).toBeUndefined();
  });
});

describe('typographyCss', () => {
  // CV chưa ai chỉnh gì phải in ra y như trước khi có tab Thiết kế.
  test('chưa chỉnh gì thì không sinh CSS nào', () => {
    expect(typographyCss({}, 10.5)).toBe('');
  });

  test('cỡ chữ tính theo cỡ gốc của mẫu, font và khoảng cách dòng đè đúng', () => {
    const css = typographyCss(
      { font: 'noto-serif', size: 'small', lineHeight: 1.2 },
      10.5,
    );

    expect(css).toContain('font-size: 9.7pt;');
    expect(css).toContain('"Noto Serif"');
    expect(css).toContain('line-height: 1.2;');
  });
});

describe('fontPt của từng mẫu', () => {
  // Tỉ lệ Nhỏ/Lớn nhân trên fontPt; lệch với cỡ thật trong CSS của mẫu thì "Vừa" và "Nhỏ" không còn đúng tỉ lệ.
  test.each(CV_THEMES.map((theme) => [theme.meta.id, theme] as const))(
    '%s: fontPt khớp cỡ chữ trong CSS của mẫu',
    (_id, theme) => {
      expect(theme.css(theme.meta.accent)).toContain(
        `font-size: ${theme.fontPt}pt;`,
      );
    },
  );
});

describe('renderCvHtml với tuỳ chọn chữ', () => {
  test('tuỳ chọn đã lưu được áp vào CSS', () => {
    const html = renderCvHtml(identity, content, 'classic', {
      font: 'arial',
      size: 'large',
    });

    expect(html).toContain('"Liberation Sans", Arial');
    expect(html).toContain('font-size: 11.3pt;');
  });

  test('không có tuỳ chọn thì không có khối CSS đè', () => {
    const html = renderCvHtml(identity, content, 'classic', null);

    expect(html).not.toMatch(/\nbody \{ font-/);
  });
});
