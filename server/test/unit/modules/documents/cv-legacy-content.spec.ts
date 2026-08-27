import type { Document } from 'src/generated/prisma/client.js';
import type { Identity } from 'src/modules/documents/content.types.js';
import { DocumentRenderer } from 'src/modules/documents/services/document-renderer.service.js';

const identity: Identity = {
  name: 'Nguyen Minh An',
  email: 'minhan@example.com',
  phone: '0900000000',
  location: 'TP. Ho Chi Minh',
  title: 'Senior Frontend Engineer',
};

const legacyCv = {
  profileStatement: 'Kỹ sư frontend 5 năm kinh nghiệm.',
  coreCompetencies: ['React'],
  experiences: [
    {
      position: 'Senior Frontend Engineer',
      company: 'FPT Software',
      location: 'Đà Nẵng',
      period: '01/2022 - 06/2024',
      bullets: ['Giảm thời gian tải trang 40%'],
    },
  ],
  educations: [],
  skillGroups: [],
};

const document = {
  kind: 'CV',
  templateId: 'classic',
  templateOptions: null,
  layout: null,
} as unknown as Document;

describe('CV lưu từ trước khi có mục Dự án', () => {
  const renderer = new DocumentRenderer(
    null as never,
    null as never,
    null as never,
  );

  test('vẫn dựng được HTML', () => {
    expect(() => renderer.toHtml(document, legacyCv, identity)).not.toThrow();
  });

  test('nội dung cũ còn nguyên', () => {
    const html = renderer.toHtml(document, legacyCv, identity);

    expect(html).toContain('Giảm thời gian tải trang 40%');
  });

  test('không sinh mục Dự án rỗng', () => {
    const html = renderer.toHtml(document, legacyCv, identity);
    const body = html!.slice(html!.indexOf('<body>'));

    expect(body).not.toContain('Dự án');
  });
});
