export const LATEX_COMPILER = Symbol('LATEX_COMPILER');

export type LatexCompileResult =
  | { ok: true; pdf: Buffer; warnings: string[] }
  | { ok: false; reason: string; log: string };

/**
 * Biến một tài liệu LaTeX thành PDF.
 *
 * Hai adapter, và đây là seam THẬT chứ không phải trừu tượng hoá phòng xa — hai
 * cách chạy này tồn tại vì hai môi trường khác nhau, không phải vì "biết đâu sau
 * này cần":
 *
 * - `SandboxLatexCompiler` — gọi `docker run` qua SEAM 2. Dùng khi app chạy TRỰC
 *   TIẾP trên máy (môi trường phát triển).
 * - `HttpLatexCompiler` — gọi một dịch vụ compile riêng. Dùng khi app chạy trong
 *   container, tức là production.
 *
 * Vì sao production không dùng được adapter Docker: app trong container không có
 * socket Docker, và mount socket vào thì (a) cho app quyền tương đương root trên
 * host, (b) vẫn vỡ ở chỗ `-v <thư mục tạm>:/work` — daemon nằm trên host nên nó
 * giải đường dẫn đó trên filesystem của host, nơi thư mục tạm bên trong container
 * app không tồn tại.
 */
export interface LatexCompiler {
  compile(tex: string): Promise<LatexCompileResult>;
  /// Môi trường compile có dùng được hay không. `/ready` đọc cái này.
  available(): Promise<boolean>;
}

/**
 * Rút lỗi LaTeX đầu tiên trong log.
 *
 * Log của lualatex dài hàng nghìn dòng đường dẫn package; dòng bắt đầu bằng `!` là
 * lỗi thật. Lấy dòng ĐẦU vì các dòng sau thường là hệ quả của nó.
 *
 * Dùng chung cho cả hai adapter: hiểu biết về định dạng log LaTeX chỉ nằm ở đây.
 */
export function firstTexError(log: string): string {
  const line = log.split('\n').find((row) => row.startsWith('!'));
  if (!line) return 'Không tạo được PDF và log không nêu lỗi cụ thể.';
  return line.replace(/^!\s*/, '').trim();
}

/**
 * Những ký tự font không vẽ được.
 *
 * Đây là cách chữ bị **âm thầm bỏ đi**: lualatex ghi "Missing character", vẫn thoát
 * 0, và PDF ra thiếu chữ mà không ai biết. Với tiếng Việt đó là rủi ro chính, nên nó
 * phải nổi lên thành cảnh báo chứ không nằm chôn trong log.
 *
 * Trên bản compile thật đã đo: **0 ký tự thiếu** với `moderncv` + TeX Gyre Pagella.
 *
 * Nhận vào chuỗi nhiều dòng. Adapter HTTP nhận các dòng này qua header (ghép bằng
 * ` | ` vì header không chứa được xuống dòng) nên nó tách lại thành dòng trước khi
 * gọi hàm này — cốt để chỉ có MỘT bộ parser cho cả hai đường.
 */
export function missingGlyphs(log: string): string[] {
  const found = new Set<string>();

  for (const line of log.split('\n')) {
    const match = /Missing character: There is no (.+?) \(/.exec(line);
    if (match) found.add(match[1]);
  }

  return [...found];
}
