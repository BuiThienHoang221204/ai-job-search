import type {
  CvContent,
  Identity,
} from 'src/modules/documents/content.types.js';
import { buildCvSections } from 'src/modules/documents/templates/body.js';
import { renderCvHtml } from 'src/modules/documents/templates/registry.js';

const identity: Identity = {
  name: 'Nguyen Minh An',
  email: 'minhan@example.com',
  phone: '0900000000',
  location: 'TP. Ho Chi Minh',
};

const content: CvContent = {
  profileStatement: 'Kỹ sư frontend 5 năm kinh nghiệm.',
  coreCompetencies: ['React'],
  experiences: [
    {
      position: 'Frontend Engineer',
      company: 'FPT Software',
      location: 'Đà Nẵng',
      period: '2022 - 2024',
      bullets: ['Giảm thời gian tải trang 40%', 'Viết test e2e'],
    },
    { position: '', company: '', location: '', period: '', bullets: [] },
  ],
  projects: [
    {
      name: 'Cổng tra cứu hóa đơn',
      role: '',
      organization: '',
      period: '',
      description: '',
      bullets: [],
      tools: ['NestJS', 'PostgreSQL'],
    },
  ],
  educations: [],
  skillGroups: [{ label: 'Frontend', items: ['React', 'Next.js'] }],
};

const editing = (cv: CvContent = content) =>
  buildCvSections(cv, undefined, 'vi', true);

/**
 * Chế độ sửa cho trang cha biết ô nào ứng với trường nào, để người dùng gõ thẳng lên CV.
 * Bản in không bao giờ bật nó — hai test cuối canh điều đó.
 */
describe('buildCvSections - chế độ sửa tại chỗ', () => {
  test('mỗi trường mang địa chỉ khớp đúng chỉ số trong bản nháp', () => {
    const html = editing();

    for (const path of [
      'profileStatement',
      'coreCompetencies.0',
      'experiences.0.position',
      'experiences.0.company',
      'experiences.0.location',
      'experiences.0.period',
      'experiences.0.bullets.1',
      'projects.0.name',
      'projects.0.tools',
      'skillGroups.0.label',
      'skillGroups.0.items',
    ]) {
      expect(html).toContain(`data-field="${path}"`);
    }
  });

  // Bản in lọc dòng rỗng; ở chế độ sửa mà lọc thì kinh nghiệm thứ hai mất và mọi chỉ số sau nó lệch so với bản nháp.
  test('dòng rỗng vẫn được vẽ, giữ đúng chỉ số, kèm chữ gợi ý', () => {
    const html = editing();

    expect(html).toContain('data-entry="experiences.1"');
    expect(html).toContain(
      'data-field="experiences.1.position" data-placeholder="Vị trí công việc"',
    );
  });

  test('danh sách rỗng có sẵn một dòng để gõ vào', () => {
    expect(editing()).toContain('data-field="experiences.1.bullets.0"');
  });

  test('mục không có nội dung vẫn hiện để còn thêm vào được', () => {
    expect(editing()).toContain('data-section="education"');
  });

  test('mục bị ẩn vẫn không được vẽ', () => {
    const html = buildCvSections(
      content,
      { order: ['profile', 'skills'], hidden: ['skills'] },
      'vi',
      true,
    );

    expect(html).not.toContain('data-section="skills"');
  });

  test('chữ do model hay người dùng gõ vẫn được escape', () => {
    const html = editing({
      ...content,
      profileStatement: '<img src=x onerror=alert(1)>',
    });

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('phần đầu CV sửa được, kể cả ô đang trống', () => {
    const html = renderCvHtml(
      identity,
      content,
      'classic',
      null,
      null,
      'vi',
      true,
    );
    const header = html.slice(
      html.indexOf('<header'),
      html.indexOf('</header>'),
    );

    for (const key of ['name', 'title', 'location', 'phone', 'email']) {
      expect(header).toContain(`data-field="identity.${key}"`);
    }
    expect(header).toContain(
      'data-field="identity.title" data-placeholder="Chức danh mong muốn"></span>',
    );
  });

  test('bản in không mang địa chỉ trường nào', () => {
    const html = renderCvHtml(identity, content, 'classic');

    expect(html).not.toContain('data-field');
    expect(html).not.toContain('data-entry');
    expect(html).not.toContain('data-placeholder');
  });

  test('bản in vẫn bỏ mục không có nội dung', () => {
    const html = buildCvSections(content, undefined, 'vi');

    expect(html).not.toContain('data-section="education"');
  });
});
