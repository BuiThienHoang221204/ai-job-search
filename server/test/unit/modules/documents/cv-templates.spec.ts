import type {
  CvContent,
  Identity,
} from 'src/modules/documents/content.types.js';
import { SECTION_TITLES } from 'src/modules/documents/templates/body.js';
import {
  CV_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  isTemplateId,
  renderCvHtml,
  resolveTemplateOptions,
} from 'src/modules/documents/templates/registry.js';

const identity: Identity = {
  name: 'Trần Thị Bích Ngọc',
  email: 'ketoan@aijob.local',
  phone: '0905123456',
  location: 'Đà Nẵng',
  title: 'Kế toán tổng hợp',
};

const content: CvContent = {
  profileStatement: 'Kế toán tổng hợp một năm kinh nghiệm.',
  coreCompetencies: ['Hạch toán chứng từ', 'Đối chiếu công nợ'],
  experiences: [
    {
      position: 'Kế toán tổng hợp',
      company: 'Công ty Đại Phát',
      location: 'Đà Nẵng',
      period: '03/2025 - nay',
      bullets: ['Hạch toán 400 chứng từ mỗi tháng'],
    },
  ],
  educations: [
    {
      degree: 'Cử nhân Kế toán',
      institution: 'Đại học Kinh tế Đà Nẵng',
      period: '2020 - 2024',
      detail: 'Loại Khá',
    },
  ],
  skillGroups: [{ label: 'Phần mềm', items: ['Misa', 'Excel'] }],
};

const ids = CV_TEMPLATES.map((template) => template.id);

describe('danh mục mẫu', () => {
  test('có đủ sáu mẫu', () => {
    expect(CV_TEMPLATES).toHaveLength(6);
  });

  test('id không trùng nhau', () => {
    // Trùng id thì `find` luôn trả về cái đầu tiên, và mẫu thứ hai trở thành không
    // bao giờ chọn được - không lỗi, không log, chỉ là một mẫu chết.
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('mẫu mặc định phải có thật trong danh mục', () => {
    expect(ids).toContain(DEFAULT_TEMPLATE_ID);
  });

  test('mẫu mặc định đứng đầu danh sách', () => {
    // `findTheme` lấy phần tử đầu làm bản dự phòng cho id lạ. Đổi thứ tự mà quên
    // điều đó thì tài liệu cũ âm thầm đổi sang một mẫu khác.
    expect(CV_TEMPLATES[0].id).toBe(DEFAULT_TEMPLATE_ID);
  });

  test.each(CV_TEMPLATES)('mẫu $id khai đủ thông tin cho kho chọn', (meta) => {
    expect(meta.name.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
    expect(['don-gian', 'chuyen-nghiep', 'hien-dai']).toContain(meta.style);
    expect(meta.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('mọi mẫu đều in ra đủ nội dung', () => {
  // Đây là phép kiểm quan trọng nhất của cả kho mẫu: thêm mẫu thứ bảy mà quên một
  // mục thì test này đỏ ngay, thay vì để người dùng phát hiện CV của mình thiếu
  // phần học vấn sau khi đã gửi đi.
  test.each(ids)('mẫu %s có đủ năm mục', (id) => {
    const html = renderCvHtml(identity, content, id);

    for (const title of Object.values(SECTION_TITLES)) {
      expect(html).toContain(title);
    }
  });

  test.each(ids)('mẫu %s có đủ danh tính và liên hệ', (id) => {
    const html = renderCvHtml(identity, content, id);

    expect(html).toContain('Trần Thị Bích Ngọc');
    expect(html).toContain('Kế toán tổng hợp');
    expect(html).toContain('ketoan@aijob.local');
  });

  test.each(ids)('mẫu %s tự chứa, không trỏ tài nguyên ra ngoài', (id) => {
    const html = renderCvHtml(identity, content, id);

    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<script');
  });

  test.each(ids)('mẫu %s giữ các luật CSS chống vỡ trang', (id) => {
    const html = renderCvHtml(identity, content, id);

    expect(html).toContain('size: A4');
    expect(html).toContain('print-color-adjust: exact');
    expect(html).toContain('break-inside: avoid');
  });
});

describe('mọi mẫu cho ra CÙNG một tầng chữ', () => {
  /** Bỏ khối `<style>` và mọi thẻ, còn lại đúng chuỗi chữ mà ATS đọc. */
  const textOf = (html: string): string =>
    html
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  test('sáu mẫu, sáu bản CSS, một chuỗi chữ duy nhất', () => {
    // Đây là lời hứa của việc dùng chung một bộ markup: người dùng đổi mẫu cho đẹp
    // hơn thì KHÔNG vô tình đổi luôn thứ tự mà máy đọc hồ sơ của mình. Mẫu nào tự
    // dựng markup riêng sẽ làm test này đỏ.
    const texts = ids.map((id) => textOf(renderCvHtml(identity, content, id)));

    for (const text of texts) {
      expect(text).toBe(texts[0]);
    }
  });

  test('thứ tự đọc là chức danh TRƯỚC khoảng thời gian', () => {
    // CSS đẩy khoảng thời gian sang mép phải, nhưng tầng chữ phải giữ thứ tự khai
    // báo - nếu không, ATS đọc ra "03/2025 - nay Kế toán tổng hợp".
    const text = textOf(renderCvHtml(identity, content, 'classic'));

    expect(text.indexOf('Kế toán tổng hợp')).toBeLessThan(
      text.indexOf('03/2025 - nay'),
    );
  });

  test('phần tử trang trí KHÔNG lọt vào tầng chữ', () => {
    // Bản LaTeX để lọt `MOBILE-ANDROID-ALT` và tám ký tự bullet vào tầng chữ mà ATS
    // đọc. Dải màu ở mẫu `thanh-mau` là một div rỗng, đúng để tránh chuyện đó.
    const text = textOf(renderCvHtml(identity, content, 'thanh-mau'));

    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(text).not.toContain('page-bar');
  });
});

describe('hai quyết định CSS đã trả giá để biết', () => {
  // Cả hai lỗi dưới đây đều KHÔNG lộ ra khi đọc số: toạ độ chữ trong PDF vẫn đúng.
  // Phải dựng ảnh trang giấy mới thấy. Nên chúng được ghim ở đây - test này không
  // chứng minh bản in đẹp, nó chỉ chặn việc ai đó gỡ mất dòng CSS đã cứu nó.

  test('mẫu thanh-mau: lề trái bằng 0 và chữ tự thụt vào', () => {
    // `position: fixed; left: 0` neo vào mép VÙNG NỘI DUNG chứ không phải mép giấy.
    // Để lề trái 22mm thì dải màu nằm chồng lên đầu mỗi dòng: "Kế toán tổng hợp"
    // in ra thành "oán tổng hợp".
    const css = renderCvHtml(identity, content, 'thanh-mau');

    expect(css).toContain('margin: 14mm 15mm 14mm 0');
    expect(css).toContain('.cv-header, .section { padding-left: 22mm; }');
  });

  test('mẫu modern: chỉ trang ĐẦU mới có lề trên bằng 0', () => {
    // Bỏ lề trên cho mọi trang thì dòng đầu trang 2 dí sát mép giấy và máy in phổ
    // thông cắt mất. @page :first tách hai chuyện đó ra.
    const css = renderCvHtml(identity, content, 'modern');

    expect(css).toContain('@page :first { margin-top: 0; }');
    expect(css).toContain('margin: 14mm 0 14mm 0');
  });
});

describe('isTemplateId', () => {
  test.each(ids)('nhận %s', (id) => {
    expect(isTemplateId(id)).toBe(true);
  });

  test.each(['', 'khong-co-mau-nay', 'Classic', '../etc/passwd'])(
    'từ chối %s',
    (id) => {
      expect(isTemplateId(id)).toBe(false);
    },
  );
});

describe('resolveTemplateOptions', () => {
  test('màu hợp lệ được giữ', () => {
    expect(resolveTemplateOptions('classic', { accent: '#ff0000' })).toEqual({
      accent: '#ff0000',
    });
  });

  test.each([
    ['null', null],
    ['object rỗng', {}],
    ['màu rút gọn', { accent: '#fff' }],
    ['không phải chuỗi', { accent: 123 }],
    ['chèn CSS', { accent: 'red;} body{display:none' }],
  ])('%s thì quay về màu mặc định của mẫu', (_label, raw) => {
    const classicAccent = CV_TEMPLATES[0].accent;

    expect(resolveTemplateOptions('classic', raw)).toEqual({
      accent: classicAccent,
    });
  });

  test('mẫu đen trắng bỏ qua màu người dùng chọn', () => {
    // Cho một giá trị vào CSS mà không chỗ nào dùng chỉ tạo cảm giác đã đổi được
    // cái gì đó. Giao diện ẩn bảng màu, còn đây là lớp chặn phía sau.
    const minimal = CV_TEMPLATES.find((t) => t.id === 'minimal')!;

    expect(resolveTemplateOptions('minimal', { accent: '#ff0000' })).toEqual({
      accent: minimal.accent,
    });
  });
});

describe('mẫu lạ thì quay về mặc định, KHÔNG ném lỗi', () => {
  // `templateId` nằm trong database. Gỡ một mẫu ở bản sau sẽ để lại tài liệu trỏ
  // vào id không còn tồn tại - ném lỗi ở đây nghĩa là CV cũ của người dùng đột nhiên
  // không mở được nữa, mất hẳn, chỉ vì một thay đổi về trình bày.
  test.each([
    ['id đã gỡ', 'mau-cu-da-go'],
    ['null', null],
    ['rỗng', ''],
  ])('%s vẫn render được', (_label, id) => {
    const html = renderCvHtml(identity, content, id);

    expect(html).toContain('Trần Thị Bích Ngọc');
    expect(html).toContain(SECTION_TITLES.experience);
  });
});
