import type {
  CvContent,
  Identity,
} from 'src/modules/documents/content.types.js';
import { SECTION_TITLES } from 'src/modules/documents/templates/body.js';
import {
  DEFAULT_LAYOUT,
  SECTION_KEYS,
  resolveLayout,
} from 'src/modules/documents/templates/cv-layout.js';
import { renderCvHtml } from 'src/modules/documents/templates/registry.js';

const identity: Identity = {
  name: 'Trần Thị Bích Ngọc',
  email: 'ketoan@aijob.local',
  phone: '0905123456',
  location: 'Đà Nẵng',
  title: 'Kế toán tổng hợp',
};

const content: CvContent = {
  profileStatement: 'Kế toán tổng hợp một năm kinh nghiệm.',
  coreCompetencies: ['Hạch toán chứng từ'],
  experiences: [
    {
      position: 'Kế toán tổng hợp',
      company: 'Công ty Đại Phát',
      location: 'Đà Nẵng',
      period: '03/2025 - nay',
      bullets: ['Hạch toán 400 chứng từ mỗi tháng'],
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
      degree: 'Cử nhân Kế toán',
      institution: 'ĐH Kinh tế Đà Nẵng',
      period: '2020 - 2024',
      detail: 'Loại Khá',
    },
  ],
  skillGroups: [{ label: 'Phần mềm', items: ['Misa'] }],
};

/** Bỏ khối style và mọi thẻ, còn lại đúng chuỗi chữ mà ATS đọc. */
const textOf = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('resolveLayout', () => {
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['object rỗng', {}],
    ['không phải object', 'xin chao'],
    ['order không phải mảng', { order: 'profile' }],
  ])('%s thì ra thứ tự mặc định', (_label, raw) => {
    expect(resolveLayout(raw)).toEqual(DEFAULT_LAYOUT);
  });

  test('giữ nguyên thứ tự người dùng chọn', () => {
    const order = [
      'skills',
      'experience',
      'projects',
      'education',
      'competencies',
      'profile',
    ];

    expect(resolveLayout({ order }).order).toEqual(order);
  });

  test('khoá thiếu được NỐI VÀO CUỐI, không biến mất', () => {
    // Đây là điều kiện để thêm mục thứ sáu ở bản sau mà CV cũ không mất mục.
    const resolved = resolveLayout({ order: ['skills', 'profile'] });

    expect(resolved.order.slice(0, 2)).toEqual(['skills', 'profile']);
    expect(new Set(resolved.order)).toEqual(new Set(SECTION_KEYS));
  });

  test('bỏ khoá lạ', () => {
    const resolved = resolveLayout({ order: ['skills', 'khong-co-muc-nay'] });

    expect(resolved.order).not.toContain('khong-co-muc-nay');
    expect(resolved.order).toHaveLength(SECTION_KEYS.length);
  });

  test('bỏ khoá trùng, giữ lần xuất hiện đầu', () => {
    // Trùng khoá thì mục đó sẽ được vẽ hai lần trong CV.
    const resolved = resolveLayout({
      order: ['skills', 'skills', 'profile'],
    });

    expect(resolved.order.filter((key) => key === 'skills')).toHaveLength(1);
    expect(resolved.order[0]).toBe('skills');
  });

  test('hidden cũng được lọc và bỏ trùng', () => {
    expect(
      resolveLayout({ hidden: ['education', 'education', 'la'] }).hidden,
    ).toEqual(['education']);
  });
});

describe('render theo bố cục', () => {
  test('mục hiện đúng thứ tự người dùng chọn', () => {
    const text = textOf(
      renderCvHtml(identity, content, 'classic', null, {
        order: ['skills', 'education', 'experience', 'competencies', 'profile'],
      }),
    );

    expect(text.indexOf(SECTION_TITLES.skills)).toBeLessThan(
      text.indexOf(SECTION_TITLES.education),
    );
    expect(text.indexOf(SECTION_TITLES.education)).toBeLessThan(
      text.indexOf(SECTION_TITLES.profile),
    );
  });

  test('mục ẩn KHÔNG lọt vào tầng chữ ATS đọc', () => {
    // Ẩn bằng `display: none` thì ATS vẫn đọc được, nên phải không vẽ ra mới đúng.
    const html = renderCvHtml(identity, content, 'classic', null, {
      hidden: ['education'],
    });

    expect(textOf(html)).not.toContain(SECTION_TITLES.education);
    expect(html).not.toContain('ĐH Kinh tế Đà Nẵng');
  });

  test('ẩn hết vẫn còn phần đầu trang', () => {
    const html = renderCvHtml(identity, content, 'classic', null, {
      hidden: [...SECTION_KEYS],
    });

    expect(html).toContain('Trần Thị Bích Ngọc');
    for (const title of Object.values(SECTION_TITLES)) {
      expect(textOf(html)).not.toContain(title);
    }
  });

  test('không truyền bố cục thì giữ nguyên thứ tự cũ', () => {
    const text = textOf(renderCvHtml(identity, content, 'classic'));
    const positions = SECTION_KEYS.map((key) =>
      text.indexOf(SECTION_TITLES[key]),
    );

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('bố cục KHÔNG làm đổi nội dung, chỉ đổi thứ tự', () => {
    const mac_dinh = textOf(renderCvHtml(identity, content, 'classic'));
    const dao = textOf(
      renderCvHtml(identity, content, 'classic', null, {
        order: ['skills', 'profile'],
      }),
    );

    expect(dao.split(' ').sort()).toEqual(mac_dinh.split(' ').sort());
  });
});
