import type {
  CvContent,
  Identity,
} from 'src/modules/documents/content.types.js';
import {
  CV_TEMPLATES,
  renderCvHtml,
} from 'src/modules/documents/templates/registry.js';

/** Màu mặc định của mẫu `classic`, tra từ chính danh mục thay vì chép lại. */
const CLASSIC_ACCENT = CV_TEMPLATES.find((t) => t.id === 'classic')!.accent;
import { escapeHtml, joinParts } from 'src/modules/documents/templates/html.js';

const identity: Identity = {
  name: 'Nguyen Minh An',
  email: 'minhan@example.com',
  phone: '0900000000',
  location: 'TP. Ho Chi Minh',
  title: 'Senior Frontend Engineer',
};

const content: CvContent = {
  profileStatement: 'Kỹ sư frontend 5 năm kinh nghiệm.',
  coreCompetencies: ['React', 'TypeScript', 'Kiểm thử tự động'],
  experiences: [
    {
      position: 'Senior Frontend Engineer',
      company: 'FPT Software',
      location: 'Đà Nẵng',
      period: '01/2022 - 06/2024',
      bullets: ['Giảm thời gian tải trang 40%'],
    },
  ],
  projects: [
    {
      name: 'Cổng tra cứu hóa đơn',
      role: 'Trưởng nhóm',
      organization: 'ATOM Solution',
      period: '2025 - nay',
      description: 'Nền tảng thu thập và đối soát hóa đơn điện tử.',
      bullets: ['Rút thời gian xử lý một hóa đơn từ 5 phút xuống 15 giây.'],
      tools: ['NestJS', 'PostgreSQL'],
    },
  ],
  educations: [
    {
      degree: 'Kỹ sư Công nghệ thông tin',
      institution: 'Đại học Bách khoa',
      period: '2015 - 2019',
      detail: 'Tốt nghiệp loại giỏi',
    },
  ],
  skillGroups: [{ label: 'Ngôn ngữ', items: ['JavaScript', 'Go'] }],
};

/** Rỗng đúng theo schema: mảng rỗng hợp lệ, chuỗi rỗng hợp lệ. */
const emptyContent: CvContent = {
  profileStatement: '',
  coreCompetencies: [],
  experiences: [],
  projects: [],
  educations: [],
  skillGroups: [],
};

describe('escapeHtml - chặn chạy mã trong khung xem trước', () => {
  // Bản HTML này KHÔNG chỉ đi vào PDF: nó được nhúng vào iframe trong phiên đăng
  // nhập của người dùng, còn nội dung thì model sinh từ mô tả công việc do người lạ
  // đăng lên. Đây là ranh giới an toàn, không phải chuyện hiển thị.
  test.each([
    ['<script>alert(1)</script>', 'chèn thẻ script'],
    ['</style><script>x</script>', 'thoát khỏi khối style'],
    ['<img src=x onerror=alert(1)>', 'sự kiện trên thẻ ảnh'],
    ['" onmouseover="alert(1)', 'thoát khỏi thuộc tính'],
  ])('vô hiệu %s (%s)', (payload) => {
    const output = escapeHtml(payload);
    expect(output).not.toMatch(/[<>]/);
  });

  test('escape đủ năm ký tự có nghĩa trong HTML', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  test('escape dấu & TRƯỚC, nếu không sẽ escape hai lần', () => {
    // Sai thứ tự thì `<` thành `&lt;` rồi dấu & của chính nó lại thành `&amp;lt;`,
    // và người đọc CV thấy chữ `&lt;` nằm giữa câu.
    expect(escapeHtml('a < b & c')).toBe('a &lt; b &amp; c');
  });

  test('giữ nguyên tiếng Việt có dấu', () => {
    expect(escapeHtml('Kỹ sư phần mềm cấp cao')).toBe('Kỹ sư phần mềm cấp cao');
  });

  test('chuỗi rỗng vẫn an toàn', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('joinParts - bỏ mảnh thiếu', () => {
  test('bỏ null, undefined và chuỗi chỉ có khoảng trắng', () => {
    expect(joinParts(['Hà Nội', null, undefined, '   ', 'a@b.c'])).toBe(
      'Hà Nội · a@b.c',
    );
  });

  test('không mảnh nào có thật thì ra chuỗi rỗng, không ra dấu phân cách', () => {
    expect(joinParts([null, ''])).toBe('');
  });
});

describe('renderCvHtml - nội dung ra đủ', () => {
  const html = renderCvHtml(identity, content);

  test('có đủ danh tính và liên hệ', () => {
    expect(html).toContain('Nguyen Minh An');
    expect(html).toContain('Senior Frontend Engineer');
    expect(html).toContain('TP. Ho Chi Minh · 0900000000 · minhan@example.com');
  });

  test.each([
    ['Giới thiệu', 'Kỹ sư frontend 5 năm kinh nghiệm.'],
    ['Năng lực chính', 'Kiểm thử tự động'],
    ['Kinh nghiệm', 'Giảm thời gian tải trang 40%'],
    ['Dự án', 'Cổng tra cứu hóa đơn'],
    ['Học vấn', 'Đại học Bách khoa'],
    ['Kỹ năng', 'JavaScript, Go'],
  ])('mục %s có mặt cùng nội dung của nó', (title, sample) => {
    expect(html).toContain(title);
    expect(html).toContain(sample);
  });

  test('công ty và nơi làm ghép thành một dòng', () => {
    expect(html).toContain('FPT Software · Đà Nẵng');
  });

  test('vai trò và tổ chức của dự án ghép thành một dòng', () => {
    expect(html).toContain('Trưởng nhóm · ATOM Solution');
  });

  test('công cụ của dự án in thành dòng riêng', () => {
    expect(html).toContain('Công cụ: NestJS, PostgreSQL');
  });

  test('là tài liệu HTML hoàn chỉnh', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="vi">');
  });
});

describe('renderCvHtml - tự chứa', () => {
  // `pdf-service` chạy Chromium với mọi tên miền bị chặn phân giải. Một tài nguyên
  // trỏ ra ngoài sẽ KHÔNG tải được, và trang in ra bằng font thay thế mà không có
  // lỗi nào báo - nên phép kiểm phải nằm ở đây chứ không phải lúc chạy.
  const html = renderCvHtml(identity, content);

  test('không có tài nguyên nào trỏ ra ngoài', () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<link');
    expect(html).not.toContain('@import');
  });

  test('không có script nào', () => {
    expect(html).not.toContain('<script');
  });
});

describe('renderCvHtml - mục rỗng thì ẩn hẳn', () => {
  // Một tiêu đề "Học vấn" đứng trên khoảng trắng đọc như dữ liệu bị mất chứ không
  // như dữ liệu chưa có. Màn xem nội dung ở giao diện đã ẩn theo quy tắc này.
  //
  // Kiểm trên PHẦN THÂN chứ không trên cả tài liệu: khối `<style>` có chú thích
  // giải thích vì sao tiêu đề mục không được rơi xuống cuối trang, và trong chú
  // thích đó có chính chữ "Kinh nghiệm". Kiểm cả tài liệu thì phép kiểm đỏ vì một
  // dòng chú thích, đúng lúc code không có gì sai.
  const html = renderCvHtml(identity, emptyContent);
  const body = html.slice(html.indexOf('<body>'));

  test.each([
    'Giới thiệu',
    'Năng lực chính',
    'Kinh nghiệm',
    'Dự án',
    'Học vấn',
    'Kỹ năng',
  ])('không in tiêu đề %s khi không có nội dung', (title) => {
    expect(body).not.toContain(title);
  });

  test('không có tiêu đề mục nào được vẽ ra', () => {
    expect(body).not.toContain('section-title');
  });

  test('vẫn in được tên người dùng', () => {
    expect(body).toContain('Nguyen Minh An');
  });
});

describe('renderCvHtml - trường tuỳ chọn thiếu', () => {
  test('không có chức danh và địa điểm thì không in dòng rỗng', () => {
    const html = renderCvHtml({ name: 'A B', email: 'a@b.c' }, emptyContent);

    expect(html).toContain('a@b.c');
    expect(html).not.toContain('class="cv-title"');
    // Dấu phân cách chỉ được xuất hiện khi có từ hai mảnh liên hệ trở lên.
    expect(html).not.toContain('· ·');
  });

  test('kinh nghiệm không có khoảng thời gian thì bỏ hẳn ô đó', () => {
    const html = renderCvHtml(identity, {
      ...emptyContent,
      experiences: [
        {
          position: 'Thực tập sinh',
          company: 'Công ty X',
          location: '',
          period: '',
          bullets: [],
        },
      ],
    });

    expect(html).toContain('Thực tập sinh');
    expect(html).not.toContain('class="entry-period"');
  });
});

describe('renderCvHtml - màu nhấn', () => {
  test('màu hợp lệ đi vào CSS', () => {
    expect(
      renderCvHtml(identity, content, 'classic', { accent: '#ff0000' }),
    ).toContain('#ff0000');
  });

  test.each([
    ['red;} body{display:none;} .x{color:red', 'chèn luật CSS mới'],
    ['#fff', 'dạng rút gọn ba ký tự'],
    ['', 'chuỗi rỗng'],
  ])('màu %s (%s) quay về mặc định thay vì đi vào CSS', (accent) => {
    const html = renderCvHtml(identity, content, 'classic', { accent });

    expect(html).toContain(CLASSIC_ACCENT);
    expect(html).not.toContain('display:none');
  });
});

describe('renderCvHtml - CSS giữ trang không vỡ', () => {
  const html = renderCvHtml(identity, content);

  test.each([
    ['print-color-adjust: exact', 'Chromium mặc định không in màu nền'],
    ['break-inside: avoid', 'một mục kinh nghiệm không được cắt làm đôi'],
    ['break-after: avoid', 'tiêu đề mục không được là dòng cuối trang'],
    ['size: A4', 'khổ giấy'],
  ])('có luật %s (%s)', (rule) => {
    expect(html).toContain(rule);
  });
});
