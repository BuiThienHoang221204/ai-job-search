export const LATEX_COMPILER = Symbol('LATEX_COMPILER');

export type LatexCompileResult =
  | { ok: true; pdf: Buffer; warnings: string[] }
  | { ok: false; reason: string; log: string };

/** Biến một tài liệu LaTeX thành PDF. */
export interface LatexCompiler {
  compile(tex: string): Promise<LatexCompileResult>;
  /** Môi trường compile có dùng được hay không. `/ready` đọc cái này. */
  available(): Promise<boolean>;
}

/** Rút lỗi LaTeX đầu tiên trong log. */
export function firstTexError(log: string): string {
  const line = log.split('\n').find((row) => row.startsWith('!'));
  if (!line) return 'Không tạo được PDF và log không nêu lỗi cụ thể.';
  return line.replace(/^!\s*/, '').trim();
}

/** Những ký tự font không vẽ được. */
export function missingGlyphs(log: string): string[] {
  const found = new Set<string>();

  for (const line of log.split('\n')) {
    const match = /Missing character: There is no (.+?) \(/.exec(line);
    if (match) found.add(match[1]);
  }

  return [...found];
}
