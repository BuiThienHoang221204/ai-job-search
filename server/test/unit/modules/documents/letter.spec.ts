import type { Identity } from 'src/modules/documents/content.types.js';
import { renderLetterHtml } from 'src/modules/documents/templates/registry.js';

const identity: Identity = {
  name: 'Nguyen Minh An',
  email: 'minhan@example.com',
  phone: '0900000000',
  location: 'TP. Ho Chi Minh',
  title: 'Senior Frontend Engineer',
};

const content = {
  salutation: 'Kính gửi Ban Tuyển dụng FPT Software,',
  opening: 'Với 5 năm kinh nghiệm frontend, tôi xin ứng tuyển vị trí này.',
  bodyParagraphs: ['Tại Tiki tôi dẫn dắt nhóm 4 kỹ sư.'],
  motivation: 'FPT phù hợp định hướng của tôi.',
  closing: 'Cảm ơn anh chị đã dành thời gian.',
};

const bodyOf = (html: string) => html.slice(html.indexOf('<body>'));

describe('renderLetterHtml', () => {
  test('cắt lời chào bị lặp ở đầu đoạn mở', () => {
    const html = renderLetterHtml(identity, 'FPT Software', 'Senior FE', {
      ...content,
      opening: `Kính gửi Ban Tuyển dụng FPT Software,\n\n${content.opening}`,
    });

    expect(bodyOf(html).match(/Kính gửi/g)).toHaveLength(1);
    expect(html).toContain('Với 5 năm kinh nghiệm frontend');
  });

  test('nhận dạng lời chào không dấu', () => {
    const html = renderLetterHtml(identity, 'FPT Software', 'Senior FE', {
      ...content,
      opening: `Kinh gui Ban Tuyen dung,\n\n${content.opening}`,
    });

    expect(html).not.toContain('Kinh gui Ban Tuyen dung');
  });

  test('có người nhận, ngày tiếng Việt và dòng chủ đề', () => {
    const html = renderLetterHtml(
      identity,
      'FPT Software',
      'Senior Dev',
      content,
      'classic',
      null,
      new Date('2026-08-13T00:00:00Z'),
    );

    expect(html).toContain('FPT Software');
    expect(html).toContain('Ngày 13 tháng 8 năm 2026');
    expect(html).toContain('Về việc: Ứng tuyển vị trí Senior Dev');
    expect(html).toContain('Trân trọng,');
  });

  test('escape chữ từ tin tuyển dụng và từ model', () => {
    const html = renderLetterHtml(identity, 'A&B <script>', 'Dev', content);

    expect(bodyOf(html)).toContain('A&amp;B &lt;script&gt;');
    expect(bodyOf(html)).not.toContain('<script>');
  });

  test('dùng chung phần đầu và màu nhấn với mẫu CV được chọn', () => {
    const html = renderLetterHtml(identity, 'FPT', 'Dev', content, 'classic', {
      accent: '#123456',
    });

    expect(html).toContain('class="cv-name"');
    expect(html).toContain('#123456');
  });
});
