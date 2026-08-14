import {
  buildFillRules,
  classifyOutcome,
  CV_PATH_IN_SANDBOX,
  outcomeMessage,
  type ApplyIdentity,
} from 'src/modules/apply/field-plan.js';
import type { PageReport } from 'src/modules/apply/apply.types.js';

const identity = (extra: Partial<ApplyIdentity> = {}): ApplyIdentity => ({
  name: 'Phạm Quản Trị',
  email: 'admin@aijob.local',
  phone: '0901234567',
  location: 'Hồ Chí Minh',
  ...extra,
});

/// Áp bảng luật đúng như script trong trang làm: luật KHỚP ĐẦU TIÊN thắng, và luật
/// file chỉ khớp ô file. Viết lại ở đây là có chủ đích — nó chính là hợp đồng giữa
/// `field-plan.ts` và `apply-script.ts`, nên nếu một bên đổi thì test này phải đỏ.
const apply = (
  label: string,
  isFile = false,
  id: ApplyIdentity = identity(),
): string | undefined =>
  buildFillRules(id).find(
    (rule) =>
      (rule.kind === 'file') === isFile &&
      new RegExp(rule.match, 'i').test(label),
  )?.value;

describe('buildFillRules - khop dung o', () => {
  test('email, dien thoai, dia diem', () => {
    expect(apply('Email')).toBe('admin@aijob.local');
    expect(apply('E-mail address')).toBe('admin@aijob.local');
    expect(apply('Số điện thoại')).toBe('0901234567');
    expect(apply('Phone number')).toBe('0901234567');
    expect(apply('City')).toBe('Hồ Chí Minh');
  });

  test('CV chi khop O FILE, khong khop o chu', () => {
    /*
     * Nhánh quan trọng: nếu luật file khớp cả ô chữ thì một ô "Attach a link to your
     * portfolio" sẽ nhận đường dẫn `/work/cv.pdf` — một chuỗi vô nghĩa gửi tới nhà
     * tuyển dụng.
     */
    expect(apply('Resume/CV', true)).toBe(CV_PATH_IN_SANDBOX);
    expect(apply('Đính kèm CV', true)).toBe(CV_PATH_IN_SANDBOX);
    expect(apply('Attach a link to your portfolio', false)).not.toBe(
      CV_PATH_IN_SANDBOX,
    );
  });

  test('ho ten tach dung theo quy uoc form phuong Tay', () => {
    /*
     * Người Việt viết HỌ TRƯỚC: "Phạm Quản Trị" có họ là "Phạm", tên gọi là "Trị".
     * Form phương Tây hỏi given/family name, nên first = phần cuối, last = phần đầu.
     * Cắt sai thì hồ sơ mang một cái tên không phải của mình.
     */
    expect(apply('First name')).toBe('Trị');
    expect(apply('Last name')).toBe('Phạm');
    expect(apply('Full name')).toBe('Phạm Quản Trị');
    expect(apply('Họ và tên')).toBe('Phạm Quản Trị');
  });

  test('ten mot tu thi ca ba o deu nhan nguyen ten', () => {
    const mot = identity({ name: 'Madonna' });
    expect(apply('First name', false, mot)).toBe('Madonna');
    expect(apply('Last name', false, mot)).toBe('Madonna');
    expect(apply('Full name', false, mot)).toBe('Madonna');
  });

  test('THU TU: luat hep phai thang luat rong', () => {
    // "First name" chứa cả `name`; nếu luật `\bname\b` đứng trước thì ô first name
    // nhận cả họ tên đầy đủ.
    expect(apply('First name')).toBe('Trị');
    expect(apply('first_name')).toBe('Trị');
    expect(apply('Given name')).toBe('Trị');
  });

  test('khong bia du lieu khong co', () => {
    // Thiếu điện thoại thì KHÔNG sinh luật, để ô đó vào `unmatched` và người dùng
    // biết mình cần bổ sung - tốt hơn là điền một chuỗi rỗng vào form.
    const thieu = identity({ phone: null, location: null });
    expect(apply('Phone', false, thieu)).toBeUndefined();
    expect(apply('City', false, thieu)).toBeUndefined();
    expect(buildFillRules(thieu).some((r) => r.value === '')).toBe(false);
  });

  test('KHONG co luat nao cho du lieu ngoai danh sach trang', () => {
    /*
     * Sandbox này vừa mang dữ liệu hồ sơ vừa có đường ra Internet. `ApplyIdentity` là
     * danh sách trắng hẹp, nên bảng luật không được chứa gì ngoài 4 trường đó.
     */
    const values = buildFillRules(identity()).map((r) => r.value);
    const chophep = [
      'Phạm Quản Trị',
      'Phạm',
      'Trị',
      'admin@aijob.local',
      '0901234567',
      'Hồ Chí Minh',
      CV_PATH_IN_SANDBOX,
    ];
    expect(values.filter((v) => !chophep.includes(v))).toEqual([]);
  });

  test('moi regex phai bien dich duoc', () => {
    // Chúng đi qua JSON rồi thành `new RegExp` trong trang; một regex sai cú pháp sẽ
    // làm cả lượt chạy chết mà chỉ thấy một lỗi trong `report.error`.
    for (const rule of buildFillRules(identity())) {
      expect(() => new RegExp(rule.match, 'i')).not.toThrow();
    }
  });
});

const report = (extra: Partial<PageReport> = {}): PageReport => ({
  reachable: true,
  status: 200,
  visibleInputs: 0,
  hasFileInput: false,
  loginHints: [],
  filled: [],
  unmatched: [],
  error: null,
  ...extra,
});

describe('classifyOutcome', () => {
  test('khong tai duoc trang -> UNREACHABLE', () => {
    expect(classifyOutcome(report({ reachable: false }))).toBe('UNREACHABLE');
  });

  test('dien duoc gi -> FILLED', () => {
    expect(
      classifyOutcome(report({ filled: [{ label: 'Email', value: 'a@b.c' }] })),
    ).toBe('FILLED');
  });

  test('DA DIEN thi FILLED, du trang co dau hieu dang nhap', () => {
    /*
     * Nhánh quan trọng nhất của hàm này. Rất nhiều form ứng tuyển công khai vẫn có
     * nút "Sign in" ở header. Xếp chúng thành LOGIN_WALL là tự bỏ đi đúng những trang
     * làm được việc.
     */
    expect(
      classifyOutcome(
        report({
          filled: [{ label: 'Email', value: 'a@b.c' }],
          loginHints: ['sign in to apply'],
        }),
      ),
    ).toBe('FILLED');
  });

  test('co dau hieu dang nhap va khong dien duoc gi -> LOGIN_WALL', () => {
    // Kết luận đúng cho cả 4 portal Việt. Không phải lỗi.
    expect(
      classifyOutcome(report({ loginHints: ['đăng nhập để ứng tuyển'] })),
    ).toBe('LOGIN_WALL');
  });

  test('co o upload file nhung chua khop truong nao -> van la FILLED', () => {
    // Ô file là dấu hiệu mạnh nhất của một form ứng tuyển thật. Nói NO_FORM ở đây là
    // nói sai, và người dùng sẽ bỏ qua một tin nộp được.
    expect(classifyOutcome(report({ hasFileInput: true }))).toBe('FILLED');
  });

  test('tai duoc trang nhung khong co gi -> NO_FORM', () => {
    expect(classifyOutcome(report({ visibleInputs: 2 }))).toBe('NO_FORM');
  });
});

describe('outcomeMessage', () => {
  test('bon ket luan cho bon cau KHAC nhau', () => {
    const cau = (
      ['FILLED', 'LOGIN_WALL', 'NO_FORM', 'UNREACHABLE'] as const
    ).map((o) => outcomeMessage(o, report()));
    expect(new Set(cau).size).toBe(4);
  });

  test('FILLED noi ro he thong KHONG bam nut nop', () => {
    // Người dùng phải biết việc nộp vẫn thuộc về họ, nếu không họ tưởng đã nộp rồi.
    const cau = outcomeMessage(
      'FILLED',
      report({ filled: [{ label: 'Email', value: 'a@b.c' }] }),
    );
    expect(cau).toMatch(/tự bấm nộp/i);
  });

  test('LOGIN_WALL noi ro vi sao khong di tiep, va buoc tiep theo', () => {
    const cau = outcomeMessage('LOGIN_WALL', report());
    expect(cau).toMatch(/đăng nhập/i);
    expect(cau).toMatch(/mật khẩu/i);
  });

  test('khong cau nao lo chi tiet ky thuat', () => {
    for (const o of [
      'FILLED',
      'LOGIN_WALL',
      'NO_FORM',
      'UNREACHABLE',
    ] as const) {
      expect(outcomeMessage(o, report())).not.toMatch(
        /docker|sandbox|playwright|selector|regex/i,
      );
    }
  });
});
