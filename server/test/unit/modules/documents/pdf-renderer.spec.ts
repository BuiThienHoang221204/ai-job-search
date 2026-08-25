import { firstRenderError } from 'src/modules/documents/pdf-render.js';
import { HttpPdfRenderer } from 'src/modules/documents/renderers/http-pdf.renderer.js';
import {
  PDF_IMAGE,
  SandboxPdfRenderer,
  countPages,
} from 'src/modules/documents/renderers/sandbox-pdf.renderer.js';
import { FakeSandbox } from 'src/testing/fake-sandbox.js';

const PDF = Buffer.from('%PDF-1.7 gia lap');
const BASE = 'http://pdf:8080';
const HTML = '<!doctype html><p>xin chao</p>';

/// Thay `fetch` toàn cục. Không dùng thư viện giả HTTP: `HttpPdfRenderer` cố ý gọi
/// `fetch` của Node, nên chỗ cần chặn đúng là hàm đó.
function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(handler(String(url), init));
  };
  return calls;
}

const pdfResponse = (pages?: string) =>
  new Response(PDF, {
    status: 200,
    headers: pages
      ? { 'Content-Type': 'application/pdf', 'X-Pdf-Pages': pages }
      : { 'Content-Type': 'application/pdf' },
  });

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('HttpPdfRenderer - duong thanh cong', () => {
  test('POST HTML toi /render va tra ve PDF', async () => {
    const calls = fakeFetch(() => pdfResponse('1'));

    const result = await new HttpPdfRenderer(BASE).render(HTML);

    expect(calls[0].url).toBe(`${BASE}/render`);
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.body).toBe(HTML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pdf.equals(PDF)).toBe(true);
      expect(result.pages).toBe(1);
    }
  });

  test('doc so trang tu header', async () => {
    fakeFetch(() => pdfResponse('3'));

    const result = await new HttpPdfRenderer(BASE).render(HTML);

    expect(result.ok && result.pages).toBe(3);
  });

  test.each([
    ['khong co header', undefined],
    ['header khong phai so', 'nhieu'],
    ['header bang 0', '0'],
  ])('%s thi so trang la 0, khong phai loi', async (_label, header) => {
    fakeFetch(() => pdfResponse(header));

    const result = await new HttpPdfRenderer(BASE).render(HTML);

    // 0 nghia la "khong biet". Cho goi bo qua phep kiem do dai thay vi canh bao
    // nham cho moi tai lieu.
    expect(result.ok).toBe(true);
    expect(result.ok && result.pages).toBe(0);
  });
});

describe('HttpPdfRenderer - duong hong', () => {
  test('PDF rong bi coi la that bai', async () => {
    fakeFetch(() => new Response(Buffer.from(''), { status: 200 }));

    const result = await new HttpPdfRenderer(BASE).render(HTML);

    expect(result.ok).toBe(false);
  });

  test('422 kem log thi rut ra cau loi', async () => {
    fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            ok: false,
            log: '! Quá thời gian in phía dịch vụ.',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const result = await new HttpPdfRenderer(BASE).render(HTML);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toBe('Quá thời gian in phía dịch vụ.');
  });

  test('khong noi duoc toi dich vu thi noi ro do la loi cau hinh he thong', async () => {
    global.fetch = () => Promise.reject(new Error('ECONNREFUSED'));

    const result = await new HttpPdfRenderer(BASE).render(HTML);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('không phải do tài liệu của bạn');
      expect(result.log).toContain('ECONNREFUSED');
    }
  });

  test('available tra false khi /health khong len', async () => {
    global.fetch = () => Promise.reject(new Error('ECONNREFUSED'));

    await expect(new HttpPdfRenderer(BASE).available()).resolves.toBe(false);
  });
});

describe('firstRenderError - log cua Chromium', () => {
  test('nhat dong bat dau bang ! ma dich vu tu viet', () => {
    expect(
      firstRenderError('[0822/...] gpu warning\n! Không tìm thấy Chromium.'),
    ).toBe('Không tìm thấy Chromium.');
  });

  test('log toan canh bao cua Chromium thi tra ve cau chung', () => {
    // Chromium do ra stderr du thu canh bao ve GPU, sandbox va DBus ngay ca trong
    // luot in THANH CONG, nen khong co dong nao dang tin de chon ra.
    const noise =
      '[0822/1] ERROR:gpu_init.cc(486) Passthrough is not supported';

    expect(firstRenderError(noise)).toBe('Không tạo được PDF từ mẫu CV này.');
  });
});

describe('SandboxPdfRenderer - hop dong voi sandbox', () => {
  test('truyen dung image, dung file vao, dung artifact can lay', async () => {
    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'document.pdf': PDF },
    });

    await new SandboxPdfRenderer(sandbox).render(HTML);

    const spec = sandbox.calls[0];
    expect(spec.image).toBe(PDF_IMAGE);
    expect(spec.files['document.html']).toBe(HTML);
    expect(spec.artifacts).toContain('document.pdf');
  });

  test.each([
    ['--no-sandbox', 'Chromium chay duoi user khong phai root'],
    ['--host-resolver-rules=MAP * ~NOTFOUND', 'cat het duong ra mang'],
  ])('BAT BUOC giu co %s (%s)', async (flag) => {
    // Hai co nay la lop bao ve, va mat chung thi ban in VAN RA binh thuong - khong
    // co gi bao. Dong lenh o day chep lai `chromium_argv` trong pdf-service/server.py,
    // nen day la cho duy nhat canh duoc rang ban chep khong bi roi mat co nao.
    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'document.pdf': PDF },
    });

    await new SandboxPdfRenderer(sandbox).render(HTML);

    expect(sandbox.calls[0].command).toContain(flag);
  });

  test('khong co PDF thi that bai kem log', async () => {
    const sandbox = new FakeSandbox().willReturn({
      artifacts: {},
      stderr: '! Chromium không tạo ra file PDF nào.',
    });

    const result = await new SandboxPdfRenderer(sandbox).render(HTML);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Chromium không tạo ra file PDF nào.');
    }
  });

  test('thieu image thi noi ro nguoi van hanh phai build gi', async () => {
    const sandbox = new FakeSandbox().willFail('IMAGE_MISSING');

    const result = await new SandboxPdfRenderer(sandbox).render(HTML);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('aijob-pdf');
  });
});

describe('countPages', () => {
  test('dem object /Type /Page', () => {
    const pdf = Buffer.from('/Type /Page x /Type /Page y /Type/Page');

    expect(countPages(pdf)).toBe(3);
  });

  test('KHONG dem nham /Type /Pages', () => {
    // `/Type /Pages` la object cay trang, luon co dung mot cai. Dem nham thi moi
    // CV deu doi ra mot trang, va canh bao "CV qua dai" ban cho ca nhung ban dung.
    const pdf = Buffer.from('/Type /Pages /Type /Page');

    expect(countPages(pdf)).toBe(1);
  });

  test('doc duoc /Type /Page nam canh byte nhi phan', () => {
    // `latin1` chu khong phai `utf8`: giai theo utf8 se thay moi byte khong hop le
    // bang U+FFFD, ke ca nhung byte nam giua chuoi dang tim.
    const pdf = Buffer.concat([
      Buffer.from([0xff, 0xfe, 0x00, 0x80]),
      Buffer.from('/Type /Page'),
      Buffer.from([0x81, 0xff]),
    ]);

    expect(countPages(pdf)).toBe(1);
  });

  test('PDF khong co trang nao thi tra 0', () => {
    expect(countPages(Buffer.from('%PDF-1.7'))).toBe(0);
  });
});
