import {
  LATEX_IMAGE,
  SandboxLatexCompiler,
} from 'src/modules/documents/compilers/sandbox-latex.compiler.js';
import { FakeSandbox } from 'src/testing/fake-sandbox.js';

const PDF = Buffer.from('%PDF-1.7 gia lap');

const compiler = (sandbox: FakeSandbox) => new SandboxLatexCompiler(sandbox);

describe('SandboxLatexCompiler - hop dong voi sandbox', () => {
  test('truyen dung lenh, dung image, dung artifact can lay', async () => {
    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'main.pdf': PDF, 'main.log': Buffer.from('') },
    });

    await compiler(sandbox).compile('\\documentclass{article}');

    const spec = sandbox.calls[0];
    expect(spec.image).toBe(LATEX_IMAGE);
    expect(spec.files['main.tex']).toBe('\\documentclass{article}');
    expect(spec.artifacts).toContain('main.pdf');
    // Log phai duoc lay ra cung PDF: khong co log thi khong the noi vi sao hong.
    expect(spec.artifacts).toContain('main.log');
  });

  test('BAT BUOC tat shell escape', async () => {
    // `-no-shell-escape` la lop chan thu hai sau `escapeLatex`. Mac dinh cua TeX
    // Live la "restricted", van cho vai lenh trong danh sach trang chay duoc.
    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'main.pdf': PDF },
    });

    await compiler(sandbox).compile('x');

    expect(sandbox.calls[0].command).toContain('-no-shell-escape');
    expect(sandbox.calls[0].command).toContain('lualatex');
  });

  test('chi chay MOT luot', async () => {
    // Da kiem tren ban compile that: `rerunfilecheck` bao file khong doi, vi
    // template khong co muc luc lan tham chieu cheo.
    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'main.pdf': PDF },
    });

    await compiler(sandbox).compile('x');

    expect(sandbox.calls).toHaveLength(1);
  });
});

describe('SandboxLatexCompiler - dieu kien thanh cong', () => {
  test('co PDF thi thanh cong', async () => {
    const sandbox = new FakeSandbox().willReturn({
      exitCode: 0,
      artifacts: { 'main.pdf': PDF },
    });

    const result = await compiler(sandbox).compile('x');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pdf).toBe(PDF);
  });

  test('exit 0 nhung KHONG co PDF thi that bai', async () => {
    /*
     * Nhanh quan trong nhat cua ca file nay.
     *
     * `-interaction=nonstopmode` khien lualatex bo qua nhieu loi va van thoat 0.
     * Neu tin exit code, ta se tra ve mot phan hoi 200 rong cho nguoi dung.
     */
    const sandbox = new FakeSandbox().willReturn({
      exitCode: 0,
      artifacts: {
        'main.log': Buffer.from('! Undefined control sequence.\nl.42'),
      },
    });

    const result = await compiler(sandbox).compile('x');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Undefined control sequence.');
  });

  test('PDF rong 0 byte cung la that bai', async () => {
    const sandbox = new FakeSandbox().willReturn({
      exitCode: 0,
      artifacts: { 'main.pdf': Buffer.alloc(0) },
    });

    expect((await compiler(sandbox).compile('x')).ok).toBe(false);
  });

  test('exit khac 0 nhung CO PDF thi van thanh cong', async () => {
    // Chieu nguoc lai: lualatex co the thoat khac 0 vi mot canh bao ma PDF van
    // dung duoc. Dieu kien la co PDF, khong phai exit code.
    const sandbox = new FakeSandbox().willReturn({
      exitCode: 1,
      artifacts: { 'main.pdf': PDF },
    });

    expect((await compiler(sandbox).compile('x')).ok).toBe(true);
  });

  test('log khong neu loi thi noi thang la khong ro', async () => {
    const sandbox = new FakeSandbox().willReturn({
      exitCode: 0,
      artifacts: { 'main.log': Buffer.from('chi la log binh thuong') },
    });

    const result = await compiler(sandbox).compile('x');
    if (!result.ok) expect(result.reason).toMatch(/không nêu lỗi cụ thể/i);
  });
});

describe('SandboxLatexCompiler - ky tu font bi bo', () => {
  test('gom canh bao Missing character, khong trung lap', async () => {
    /*
     * Day la cach chu bi AM THAM bo khoi PDF: lualatex ghi "Missing character",
     * van thoat 0, va PDF ra thieu chu. Voi tieng Viet do la rui ro chinh.
     */
    const log = [
      'Missing character: There is no ạ (U+1EA1) in font lmroman10-regular!',
      'Missing character: There is no ữ (U+1EEF) in font lmroman10-regular!',
      'Missing character: There is no ạ (U+1EA1) in font lmroman10-regular!',
    ].join('\n');

    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'main.pdf': PDF, 'main.log': Buffer.from(log) },
    });

    const result = await compiler(sandbox).compile('x');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual(['ạ', 'ữ']);
    }
  });

  test('log sach thi khong co canh bao nao', async () => {
    // Trung voi ket qua do that: moderncv + TeX Gyre Pagella cho 0 ky tu thieu.
    const sandbox = new FakeSandbox().willReturn({
      artifacts: { 'main.pdf': PDF, 'main.log': Buffer.from('binh thuong') },
    });

    const result = await compiler(sandbox).compile('x');
    if (result.ok) expect(result.warnings).toEqual([]);
  });
});

describe('SandboxLatexCompiler - loi cua sandbox', () => {
  const cases: Array<[Parameters<FakeSandbox['willFail']>[0], RegExp]> = [
    ['TIMEOUT', /quá thời gian/i],
    ['RUNTIME_UNAVAILABLE', /cấu hình phía hệ thống/i],
    ['IMAGE_MISSING', /LaTeX|TeX Live/],
    ['OTHER', /không tạo được PDF/i],
  ];

  test.each(cases)('%s cho ra cau rieng', async (kind, pattern) => {
    const sandbox = new FakeSandbox().willFail(kind);

    const result = await compiler(sandbox).compile('x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(pattern);
      // Khong lo ten lop loi hay chi tiet ky thuat ra cho nguoi dung.
      expect(result.reason).not.toMatch(/SandboxError|docker|ENOENT/i);
    }
  });

  test('moi phan loai cho ra mot cau KHAC nhau', async () => {
    const reasons: string[] = [];
    for (const [kind] of cases) {
      const result = await compiler(new FakeSandbox().willFail(kind)).compile(
        'x',
      );
      if (!result.ok) reasons.push(result.reason);
    }
    expect(new Set(reasons).size).toBe(cases.length);
  });
});
