import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';
import { PDF_IMAGE } from 'src/modules/documents/pdf/sandbox.js';

/**
 * Kho mẫu CV: xem trước, đổi mẫu, và ghim thứ tự route.
 *
 * Phép khẳng định xuyên suốt: **`FakeAi` không được gọi**. Nó ném lỗi khi bị gọi mà
 * không có dữ liệu xếp sẵn, nên một đường nào lỡ gọi model sẽ làm test đỏ ngay.
 */
const CV_CONTENT = {
  profileStatement: 'Kế toán tổng hợp một năm kinh nghiệm.',
  coreCompetencies: ['Hạch toán chứng từ', 'Đối chiếu công nợ'],
  experiences: [
    {
      position: 'Kế toán tổng hợp',
      company: 'Công ty Đại Phát',
      location: 'Đà Nẵng',
      period: '03/2025 - nay',
      bullets: ['Hạch toán 400 chứng từ mỗi tháng.'],
    },
  ],
  educations: [
    {
      degree: 'Cử nhân Kế toán',
      institution: 'ĐH Kinh tế Đà Nẵng',
      period: '2020 - 2024',
      detail: '',
    },
  ],
  skillGroups: [{ label: 'Phần mềm', items: ['Misa'] }],
};

describe('Kho mẫu CV', () => {
  let harness: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
  });

  /// Một CV đã DONE, đúng trạng thái mà kho chọn mẫu làm việc trên đó.
  const seedDoneCv = () =>
    harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'CV',
        title: 'CV tổng quát',
        status: 'DONE',
        content: CV_CONTENT,
        modelId: 'deepseek-v4-flash-free',
        generatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  test('GET /documents/cv-templates trả về danh mục, KHÔNG rơi vào :id', async () => {
    /*
     * Đã hỏng thật một lần: `@Get('cv-templates')` khai SAU `@Get(':id')` nên Nest
     * khớp "cv-templates" vào `:id` và trả 404 "Không tìm thấy tài liệu:
     * cv-templates". Không có gì trong typecheck hay unit test bắt được, vì lỗi nằm ở
     * THỨ TỰ khai báo chứ không ở nội dung hàm.
     */
    const response = await request(harness.server)
      .get('/api/documents/cv-templates')
      .set(auth())
      .expect(200);

    const body = response.body as { items: Array<{ id: string }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.map((item) => item.id)).toContain('classic');
  });

  test('xem trước trả HTML kèm header chặn script', async () => {
    const document = await seedDoneCv();

    const response = await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .set(auth())
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    // Lớp chặn thứ hai sau `escapeHtml`: trang xem trước nằm trong iframe của phiên
    // đăng nhập, và nội dung do model sinh từ tin tuyển dụng người lạ đăng.
    expect(response.headers['content-security-policy']).toBe('sandbox');
    expect(response.text).toContain('Kế toán tổng hợp');
    expect(response.text).toContain('ĐH Kinh tế Đà Nẵng');
  });

  test('xem trước mẫu khác KHÔNG ghi gì vào database', async () => {
    // Đây là thứ làm cho kho chọn mẫu bấm thử được.
    const document = await seedDoneCv();

    await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .send({ templateId: 'trang-trong' })
      .set(auth())
      .expect(200);

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(after.templateId).toBe('classic');
  });

  test('đổi mẫu lưu lại và KHÔNG đụng tới nội dung', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/template`)
      .set(auth())
      .send({ templateId: 'modern', accent: '#0f766e' })
      .expect(200);

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });

    expect(after.templateId).toBe('modern');
    expect(after.templateOptions).toEqual({ accent: '#0f766e' });
    // Nội dung là nguồn sự thật; đổi cách trình bày không được chạm vào nó, và
    // cũng không được đổi dấu vết lượt gọi model đã sinh ra nó.
    expect(after.content).toEqual(CV_CONTENT);
    expect(after.modelId).toBe('deepseek-v4-flash-free');
    expect(after.generatedAt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  test('danh sách CV trả mẫu và ngôn ngữ để vẽ thẻ, KHÔNG trả nội dung', async () => {
    const document = await seedDoneCv();
    await request(harness.server)
      .put(`/api/documents/${document.id}/template`)
      .set(auth())
      .send({ templateId: 'modern', accent: '#0f766e' })
      .expect(200);

    const response = await request(harness.server)
      .get('/api/documents')
      .query({ kind: 'CV' })
      .set(auth())
      .expect(200);
    const [item] = (response.body as { items: Record<string, unknown>[] })
      .items;

    expect(item).toMatchObject({
      templateId: 'modern',
      templateOptions: { accent: '#0f766e' },
      language: 'VI',
    });
    expect(item).not.toHaveProperty('content');
  });

  test('danh sách tài liệu trả jobId và logo công ty của tin để vẽ thẻ', async () => {
    const job = await harness.prisma.job.create({
      data: {
        source: 'topcv',
        url: 'https://x/logo',
        title: 'Kế toán tổng hợp',
        company: 'Đại Phát',
        companyLogo: 'https://cdn.example/dai-phat.png',
        description: 'd',
      },
    });
    await harness.prisma.document.create({
      data: {
        userId: user.id,
        jobId: job.id,
        kind: 'COVER_LETTER',
        title: 'Thư xin việc',
        status: 'DONE',
        content: {},
      },
    });

    const response = await request(harness.server)
      .get('/api/documents')
      .query({ kind: 'COVER_LETTER' })
      .set(auth())
      .expect(200);
    const [item] = (response.body as { items: Record<string, unknown>[] })
      .items;

    expect(item.jobId).toBe(job.id);
    expect(item.job).toEqual({
      id: job.id,
      title: 'Kế toán tổng hợp',
      company: 'Đại Phát',
      companyLogo: 'https://cdn.example/dai-phat.png',
    });
  });

  test('mẫu đã lưu được dùng cho lượt xem trước sau đó', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/template`)
      .set(auth())
      .send({ templateId: 'thanh-mau' })
      .expect(200);

    const response = await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .set(auth())
      .expect(200);

    // Dải màu dọc chỉ có ở mẫu `thanh-mau`.
    expect(response.text).toContain('.page-bar {');
    expect(response.text).toContain('position: fixed');
  });

  test.each([
    ['mẫu không tồn tại', { templateId: 'khong-co-mau-nay' }, 400],
    ['màu sai định dạng', { templateId: 'classic', accent: 'red' }, 400],
    [
      'chèn CSS qua màu',
      { templateId: 'classic', accent: '#f;}body{x:1' },
      400,
    ],
  ])('từ chối %s', async (_label, payload, status) => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/template`)
      .set(auth())
      .send(payload)
      .expect(status);
  });

  test('không đổi được mẫu của tài liệu người khác', async () => {
    const document = await seedDoneCv();
    const other = await harness.signUp();

    await request(harness.server)
      .put(`/api/documents/${document.id}/template`)
      .set({ Authorization: `Bearer ${other.token}` })
      .send({ templateId: 'modern' })
      .expect(404);
  });

  test('không xem trước được tài liệu người khác', async () => {
    const document = await seedDoneCv();
    const other = await harness.signUp();

    await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .set({ Authorization: `Bearer ${other.token}` })
      .expect(404);
  });

  test('tài liệu chưa sinh xong thì chưa xem trước được', async () => {
    const pending = await harness.prisma.document.create({
      data: { userId: user.id, kind: 'CV', title: 'CV tổng quát' },
    });

    await request(harness.server)
      .post(`/api/documents/${pending.id}/preview`)
      .set(auth())
      .expect(422);
  });

  test('thư xin việc không có mẫu để đổi', async () => {
    const letter = await harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'COVER_LETTER',
        title: 'Thư xin việc',
        status: 'DONE',
        content: { salutation: 'Kính gửi', opening: 'x' },
      },
    });

    await request(harness.server)
      .put(`/api/documents/${letter.id}/template`)
      .set(auth())
      .send({ templateId: 'modern' })
      .expect(422);
  });

  describe('thư xin việc in cùng mẫu với CV của tin đó', () => {
    const LETTER_CONTENT = {
      salutation: 'Kính gửi Bộ phận Tuyển dụng,',
      opening: 'Tôi ứng tuyển vị trí Kế toán tổng hợp.',
      bodyParagraphs: ['Tôi hạch toán 400 chứng từ mỗi tháng.'],
      motivation: 'Công ty đang mở rộng nhà máy.',
      closing: 'Mong được trao đổi thêm.',
    };

    const seedJobWithLetter = async () => {
      const job = await harness.prisma.job.create({
        data: {
          source: 'test',
          url: 'https://example.test/ke-toan',
          title: 'Kế toán tổng hợp',
          company: 'Công ty Thép Miền Trung',
          description: 'Mô tả đủ dài cho một tin tuyển dụng kế toán.',
        },
      });
      const letter = await harness.prisma.document.create({
        data: {
          userId: user.id,
          jobId: job.id,
          kind: 'COVER_LETTER',
          title: 'Thư xin việc',
          status: 'DONE',
          content: LETTER_CONTENT,
        },
      });
      return { job, letter };
    };

    const previewOf = (id: string) =>
      request(harness.server)
        .post(`/api/documents/${id}/preview`)
        .set(auth())
        .expect(200);

    test('mượn mẫu và màu của CV cho cùng tin', async () => {
      const { job, letter } = await seedJobWithLetter();
      await harness.prisma.document.create({
        data: {
          userId: user.id,
          jobId: job.id,
          kind: 'CV',
          title: '',
          status: 'DONE',
          content: CV_CONTENT,
          templateId: 'trang-trong',
          templateOptions: { accent: '#123456' },
        },
      });

      const html = (await previewOf(letter.id)).text;

      expect(html).toContain('Noto Serif');
      expect(html).toContain('Công ty Thép Miền Trung');
      expect(html).toContain('Về việc: Ứng tuyển vị trí Kế toán tổng hợp');
    });

    test('không có CV cho tin đó thì dùng mẫu mặc định', async () => {
      const { letter } = await seedJobWithLetter();

      const html = (await previewOf(letter.id)).text;

      expect(html).toContain('#3873b3');
    });

    test('không mượn mẫu CV của người khác', async () => {
      const { job, letter } = await seedJobWithLetter();
      const other = await harness.signUp();
      await harness.prisma.document.create({
        data: {
          userId: other.id,
          jobId: job.id,
          kind: 'CV',
          title: '',
          status: 'DONE',
          content: CV_CONTENT,
          templateId: 'trang-trong',
        },
      });

      const html = (await previewOf(letter.id)).text;

      expect(html).not.toContain('Noto Serif');
    });

    test('tải PDF thư in bằng HTML', async () => {
      const { letter } = await seedJobWithLetter();

      await request(harness.server)
        .get(`/api/documents/${letter.id}/pdf`)
        .set(auth());

      expect(harness.sandbox.calls.map((call) => call.image)).toEqual([
        PDF_IMAGE,
      ]);
    });
  });
});
