import { z } from 'zod';
import type { Document } from 'src/generated/prisma/client.js';
import { cvSchema } from 'src/modules/documents/document.schema.js';
import type {
  CvContent,
  Identity,
} from 'src/modules/documents/content.types.js';
import { renderCv } from 'src/modules/documents/latex.js';
import { renderCvHtml } from 'src/modules/documents/templates/registry.js';
import { SECTION_TITLES } from 'src/modules/documents/templates/cv-layout.js';
import { DocumentRenderer } from 'src/modules/documents/services/document-renderer.service.js';

const identity: Identity = {
  name: 'Nguyen Minh An',
  email: 'minhan@example.com',
  phone: '0900000000',
  location: 'TP. Ho Chi Minh',
  title: 'Senior Frontend Engineer',
};

const content: CvContent = {
  profileStatement: 'Kỹ sư frontend 5 năm kinh nghiệm.',
  coreCompetencies: ['React'],
  experiences: [
    {
      position: 'Senior Frontend Engineer',
      company: 'FPT Software',
      location: '',
      period: '2022 - 2024',
      bullets: ['Giảm thời gian tải trang 40%'],
    },
  ],
  projects: [
    {
      name: 'Cổng tra cứu hóa đơn',
      role: 'Trưởng nhóm',
      organization: 'ATOM Solution',
      period: '2025 - nay',
      description: '',
      bullets: [],
      tools: ['NestJS'],
    },
  ],
  educations: [
    {
      degree: 'Kỹ sư',
      institution: 'DH Bach Khoa',
      period: '',
      detail: '',
    },
  ],
  skillGroups: [{ label: 'Ngôn ngữ', items: ['TypeScript'] }],
};

const documentOf = (language: 'VI' | 'EN' | undefined) =>
  ({
    kind: 'CV',
    templateId: 'classic',
    templateOptions: null,
    layout: null,
    language,
  }) as unknown as Document;

describe('cvSchema mang ngôn ngữ vào từng trường', () => {
  const descriptions = (language?: 'vi' | 'en'): string =>
    JSON.stringify(z.toJSONSchema(cvSchema(language), { io: 'input' }));

  test('bản tiếng Việt ra lệnh viết tiếng Việt', () => {
    expect(descriptions('vi')).toContain('Viết bằng tiếng Việt có dấu.');
    expect(descriptions('vi')).not.toContain('Write in English.');
  });

  test('bản tiếng Anh KHÔNG còn câu ra lệnh viết tiếng Việt ở bất kỳ trường nào', () => {
    expect(descriptions('en')).toContain('Write in English.');
    expect(descriptions('en')).not.toContain('tiếng Việt');
  });

  test('mặc định là tiếng Việt', () => {
    expect(descriptions('vi')).toBe(descriptions());
  });
});

describe('tiêu đề mục đổi theo ngôn ngữ', () => {
  test('bản HTML', () => {
    const vi = renderCvHtml(identity, content, 'classic', null, null, 'vi');
    const en = renderCvHtml(identity, content, 'classic', null, null, 'en');

    expect(vi).toContain(SECTION_TITLES.vi.experience);
    expect(en).toContain(SECTION_TITLES.en.experience);
    expect(en.slice(en.indexOf('<body>'))).not.toContain(
      SECTION_TITLES.vi.experience,
    );
  });

  test('bản LaTeX', () => {
    const vi = renderCv(identity, content, 'vi');
    const en = renderCv(identity, content, 'en');

    expect(vi).toContain(`\\section{${SECTION_TITLES.vi.education}}`);
    expect(en).toContain(`\\section{${SECTION_TITLES.en.education}}`);
    expect(en).not.toContain(`\\section{${SECTION_TITLES.vi.education}}`);
  });

  test('hai bộ trình bày dùng cùng một bảng tiêu đề', () => {
    const html = renderCvHtml(identity, content, 'classic', null, null, 'en');
    const tex = renderCv(identity, content, 'en');

    for (const title of Object.values(SECTION_TITLES.en)) {
      expect(html).toContain(title);
      expect(tex).toContain(title);
    }
  });

  test('nhãn công cụ của dự án cũng đổi theo', () => {
    expect(renderCv(identity, content, 'vi')).toContain('Công cụ: NestJS');
    expect(renderCv(identity, content, 'en')).toContain('Tools: NestJS');
  });
});

describe('tài liệu lưu trước khi có cột language', () => {
  const renderer = new DocumentRenderer(
    null as never,
    null as never,
    null as never,
  );

  test('thiếu language thì render bằng tiếng Việt, không vỡ', () => {
    const html = renderer.toHtml(documentOf(undefined), content, identity);

    expect(html).toContain(SECTION_TITLES.vi.experience);
  });

  test('language EN thì đổi tiêu đề', () => {
    const html = renderer.toHtml(documentOf('EN'), content, identity);

    expect(html).toContain(SECTION_TITLES.en.experience);
  });
});
