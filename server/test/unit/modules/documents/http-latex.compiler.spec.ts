import { HttpLatexCompiler } from 'src/modules/documents/compilers/http-latex.compiler.js';

const PDF = Buffer.from('%PDF-1.7 gia lap');
const BASE = 'http://latex:8080';

/// Thay `fetch` toàn cục. Không dùng thư viện giả HTTP: `HttpLatexCompiler` cố ý gọi
/// `fetch` của Node, nên chỗ cần chặn đúng là hàm đó.
function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(handler(String(url), init));
  };
  return calls;
}

const pdfResponse = (warnings = '') =>
  new Response(PDF, {
    status: 200,
    headers: warnings
      ? { 'Content-Type': 'application/pdf', 'X-Latex-Warnings-B64': warnings }
      : { 'Content-Type': 'application/pdf' },
  });

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('HttpLatexCompiler - duong thanh cong', () => {
  test('POST .tex tới /compile va tra ve PDF', async () => {
    const calls = fakeFetch(() => pdfResponse());

    const result = await new HttpLatexCompiler(BASE).compile(
      '\\documentclass{x}',
    );

    expect(calls[0].url).toBe(`${BASE}/compile`);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.body).toBe('\\documentclass{x}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pdf.equals(PDF)).toBe(true);
  });

  test('bo dau / thua o cuoi baseUrl khong lam URL co // ', async () => {
    // `configuration.ts` da cat dau / cuoi, nhung adapter khong duoc phu thuoc vao
    // dieu do: no cung duoc dung truc tiep trong test va script.
    const calls = fakeFetch(() => pdfResponse());
    await new HttpLatexCompiler(BASE).compile('x');
    expect(calls[0].url).not.toContain('//compile');
  });

  test('doc canh bao tu header va dung CUNG parser voi adapter Docker', async () => {
    /*
     * Diem quan trong nhat cua file nay.
     *
     * Dich vu ghep cac dong `Missing character` bang ' | ' roi ma hoa base64. Adapter
     * phai giai ma, tach lai, va dua qua dung ham `missingGlyphs` — neu no tu parse
     * rieng thi hai duong se lech nhau, va lech o day nghia la mot ban PDF thieu chu
     * di ra ma khong ai canh bao.
     */
    const lines = [
      'Missing character: There is no ạ (U+1EA1) in font pagella!',
      'Missing character: There is no ữ (U+1EEF) in font pagella!',
    ].join(' | ');

    /*
     * Ma hoa base64 dung nhu dich vu lam. Ban dau test nay gui thang chuoi tieng
     * Viet vao header va NO DO — dung ly do: gia tri header HTTP phai la ISO-8859-1
     * nen `new Response(...)` nem loi, va do la mot loi THAT trong thiet ke, khong
     * phai loi cua test. Neu dung chu ASCII gia thi khong bao gio lo ra.
     */
    const header = Buffer.from(lines, 'utf8').toString('base64');

    fakeFetch(() => pdfResponse(header));

    const result = await new HttpLatexCompiler(BASE).compile('x');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual(['ạ', 'ữ']);
  });

  test('header base64 hong thi bo canh bao, KHONG lam hong ca luot tao PDF', async () => {
    // Nguoi dung da co file dung duoc; canh bao chi la thong tin them.
    fakeFetch(() => pdfResponse('!!!khong-phai-base64!!!'));

    const result = await new HttpLatexCompiler(BASE).compile('x');

    expect(result.ok).toBe(true);
  });

  test('khong co header canh bao thi mang rong', async () => {
    fakeFetch(() => pdfResponse());
    const result = await new HttpLatexCompiler(BASE).compile('x');
    if (result.ok) expect(result.warnings).toEqual([]);
  });

  test('200 nhung than rong van la that bai', async () => {
    // Mot proxy o giua co the tra 200 voi than rong. Mot PDF 0 byte te hon mot loi.
    fakeFetch(() => new Response(Buffer.alloc(0), { status: 200 }));

    const result = await new HttpLatexCompiler(BASE).compile('x');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/rỗng/i);
  });
});

describe('HttpLatexCompiler - duong that bai', () => {
  test('422 kem log thi rut loi LaTeX dau tien', async () => {
    fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            ok: false,
            log: 'day la log\n! Undefined control sequence.\nl.42 \\xyz',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const result = await new HttpLatexCompiler(BASE).compile('x');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Undefined control sequence.');
  });

  test('413 kem error thi hien chinh cau do', async () => {
    fakeFetch(
      () =>
        new Response(
          JSON.stringify({ ok: false, error: 'File .tex quá lớn' }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );

    const result = await new HttpLatexCompiler(BASE).compile('x');
    if (!result.ok) expect(result.reason).toBe('File .tex quá lớn');
  });

  test('than khong phai JSON thi khong doan, dung cau mac dinh', async () => {
    // Vi du: mot trang loi HTML cua proxy.
    fakeFetch(() => new Response('<html>502</html>', { status: 502 }));

    const result = await new HttpLatexCompiler(BASE).compile('x');
    if (!result.ok) expect(result.reason).toMatch(/không nêu lỗi cụ thể/i);
  });

  test('khong noi duoc toi dich vu thi noi ro la loi phia he thong', async () => {
    global.fetch = () => Promise.reject(new Error('fetch failed'));

    const result = await new HttpLatexCompiler(BASE).compile('x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/cấu hình phía hệ thống/i);
      // Khong lo chi tiet ky thuat ra cho nguoi dung.
      expect(result.reason).not.toMatch(/fetch|ECONNREFUSED|http/i);
    }
  });
});

describe('HttpLatexCompiler - available', () => {
  test('health 200 la san sang', async () => {
    const calls = fakeFetch(() => new Response('{}', { status: 200 }));

    expect(await new HttpLatexCompiler(BASE).available()).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/health`);
  });

  test('health hong la KHONG san sang, khong nem loi', async () => {
    fakeFetch(() => new Response('', { status: 503 }));
    expect(await new HttpLatexCompiler(BASE).available()).toBe(false);
  });

  test('khong noi duoc cung la KHONG san sang', async () => {
    global.fetch = () => Promise.reject(new Error('fetch failed'));
    expect(await new HttpLatexCompiler(BASE).available()).toBe(false);
  });
});
