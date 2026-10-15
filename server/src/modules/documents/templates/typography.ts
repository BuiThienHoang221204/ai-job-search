export const CV_FONTS = {
  'noto-sans':
    '"Noto Sans", "Liberation Sans", "DejaVu Sans", Arial, sans-serif',
  'noto-serif':
    '"Noto Serif", "Liberation Serif", "DejaVu Serif", Georgia, serif',
  arial: '"Liberation Sans", Arial, "Noto Sans", sans-serif',
  times: '"Liberation Serif", "Times New Roman", "Noto Serif", serif',
} as const;

export type CvFont = keyof typeof CV_FONTS;

export const FONT_SCALES = { small: 0.92, medium: 1, large: 1.08 } as const;

export type CvFontSize = keyof typeof FONT_SCALES;

export const LINE_HEIGHT_MIN = 1.2;
export const LINE_HEIGHT_MAX = 1.8;

export type CvTypography = {
  font?: CvFont;
  size?: CvFontSize;
  lineHeight?: number;
};

export const isCvFont = (value: unknown): value is CvFont =>
  typeof value === 'string' && value in CV_FONTS;

export const isCvFontSize = (value: unknown): value is CvFontSize =>
  typeof value === 'string' && value in FONT_SCALES;

export const isLineHeight = (value: unknown): value is number =>
  typeof value === 'number' &&
  value >= LINE_HEIGHT_MIN &&
  value <= LINE_HEIGHT_MAX;

/** Giá trị từ cột Json hay request: hỏng thì quay về mặc định của mẫu thay vì làm hỏng CV. */
export function resolveTypography(raw: unknown): CvTypography {
  const stored = (raw ?? {}) as Record<string, unknown>;
  return {
    font: isCvFont(stored.font) ? stored.font : undefined,
    size:
      isCvFontSize(stored.size) && stored.size !== 'medium'
        ? stored.size
        : undefined,
    lineHeight: isLineHeight(stored.lineHeight) ? stored.lineHeight : undefined,
  };
}

/** CSS đè lên font, cỡ chữ, khoảng cách dòng của mẫu; chuỗi rỗng khi người dùng chưa chỉnh gì, nên bản in cũ giữ nguyên. */
export function typographyCss(
  typography: CvTypography,
  themeFontPt: number,
): string {
  const rules: string[] = [];
  if (typography.font) rules.push(`font-family: ${CV_FONTS[typography.font]};`);
  if (typography.size) {
    const size =
      Math.round(themeFontPt * FONT_SCALES[typography.size] * 10) / 10;
    rules.push(`font-size: ${size}pt;`);
  }
  if (typography.lineHeight)
    rules.push(`line-height: ${typography.lineHeight};`);
  if (rules.length === 0) return '';
  return `\nbody { ${rules.join(' ')} }\n`;
}
