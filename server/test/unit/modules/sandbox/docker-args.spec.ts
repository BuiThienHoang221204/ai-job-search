import { dockerArgs } from 'src/modules/sandbox/docker.sandbox.js';
import type { SandboxSpec } from 'src/modules/sandbox/sandbox.interface.js';

/*
 * Đây là test bảo mật, không phải test tiện lợi.
 *
 * `dockerArgs` là chỗ DUY NHẤT quyết định một lượt chạy có ra được Internet hay
 * không. Một lượt sandbox mang theo dữ liệu hồ sơ thật; mở mạng cho nó là mở đường
 * mang dữ liệu đó ra ngoài. Vì vậy nó được tách thành hàm thuần để kiểm được mà
 * không cần Docker, và mọi khẳng định dưới đây đều là "phải như vậy", không phải
 * "hiện đang như vậy".
 */
const spec = (extra: Partial<SandboxSpec> = {}): SandboxSpec => ({
  image: 'texlive/texlive:latest',
  files: { 'main.tex': 'x' },
  command: ['lualatex', 'main.tex'],
  timeoutMs: 60_000,
  artifacts: ['main.pdf'],
  ...extra,
});

/// Giá trị đi ngay sau một cờ. Đọc theo cặp chứ không theo chỉ số cứng: thêm một
/// tham số vào giữa danh sách thì test không được đỏ vì lý do sai.
const valueOf = (args: string[], flag: string): string | undefined =>
  args[args.indexOf(flag) + 1];

describe('dockerArgs - mạng', () => {
  test('luôn CẮT MẠNG, spec không có cách nào mở', () => {
    expect(valueOf(dockerArgs('c', '/tmp/w', spec()), '--network')).toBe(
      'none',
    );
  });
});

describe('dockerArgs - các chốt an toàn khác', () => {
  test('luôn có --rm và --pull never', () => {
    const args = dockerArgs('c', '/tmp/w', spec());
    expect(args).toContain('--rm');
    // Ảnh TeX Live 8,92GB / Playwright ~2GB: tải giữa một request của người dùng
    // là treo vài phút rồi hết giờ. Thiếu ảnh phải là lỗi nói rõ.
    expect(valueOf(args, '--pull')).toBe('never');
  });

  test('trần bộ nhớ và CPU luôn có, mặc định 512MB / 1 CPU', () => {
    const args = dockerArgs('c', '/tmp/w', spec());
    expect(valueOf(args, '--memory')).toBe('512m');
    expect(valueOf(args, '--cpus')).toBe('1');
  });

  test('caller nới được trần bộ nhớ', () => {
    const args = dockerArgs('c', '/tmp/w', spec({ memoryMb: 2048 }));
    expect(valueOf(args, '--memory')).toBe('2048m');
  });

  test('mount thư mục làm việc vào /work và chạy ở đó', () => {
    const args = dockerArgs('c', '/tmp/w', spec());
    expect(valueOf(args, '-v')).toBe('/tmp/w:/work');
    expect(valueOf(args, '-w')).toBe('/work');
  });

  test('tên container được truyền, để còn xoá được khi hết giờ', () => {
    // `--rm` chỉ xoá khi client kết thúc bình thường. Hết giờ thì ta giết client,
    // và không có tên thì container bị bỏ rơi kèm 512MB.
    expect(valueOf(dockerArgs('aijob-abc', '/tmp/w', spec()), '--name')).toBe(
      'aijob-abc',
    );
  });

  test('image và lệnh nằm CUỐI, theo đúng thứ tự', () => {
    const args = dockerArgs('c', '/tmp/w', spec());
    expect(args.slice(-3)).toEqual([
      'texlive/texlive:latest',
      'lualatex',
      'main.tex',
    ]);
  });
});
