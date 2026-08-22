import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Người dùng sửa CV: chữ, thứ tự mục, mục bị ẩn.
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

describe('Sửa CV', () => {
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

  const seedDoneCv = () =>
    harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'CV',
        title: 'CV tổng quát',
        status: 'DONE',
        content: CV_CONTENT,
        storageKey: `${user.id}/cv/main_tong-quat.tex`,
        modelId: 'deepseek-v4-flash-free',
        generatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  test('sửa chữ được lưu lại và KHÔNG gọi model', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({
        content: {
          ...CV_CONTENT,
          profileStatement: 'Câu giới thiệu do người dùng tự viết lại.',
        },
      })
      .expect(200);

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });

    expect((after.content as typeof CV_CONTENT).profileStatement).toBe(
      'Câu giới thiệu do người dùng tự viết lại.',
    );
    expect(after.modelId).toBe('deepseek-v4-flash-free');
  });

  test('file .tex được render lại sau khi sửa', async () => {
    /*
     * Không render lại thì `.tex` đã lưu thành cũ, trong khi nút "Xem mã .tex" và
     * đường PDF LaTeX vẫn đọc đúng file đó - người dùng thấy chữ cũ trong bản tải về
     * dù màn hình đã hiện chữ mới.
     */
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({
        content: { ...CV_CONTENT, profileStatement: 'CHU-MOI-TRONG-TEX' },
      })
      .expect(200);

    const tex = await request(harness.server)
      .get(`/api/documents/${document.id}/source`)
      .set(auth())
      .expect(200);

    expect(tex.text).toContain('CHU-MOI-TRONG-TEX');
  });

  test('xoá bớt tới rỗng vẫn được chấp nhận', async () => {
    // `cvSchema` bắt model viết tối thiểu 3 năng lực; người dùng thì có quyền xoá
    // hết. Dùng lại schema của model ở đây sẽ từ chối thao tác xoá dòng cuối cùng.
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({
        content: {
          profileStatement: '',
          coreCompetencies: [],
          experiences: [],
          educations: [],
          skillGroups: [],
        },
      })
      .expect(200);
  });

  test('lưu được thứ tự mục và mục ẩn', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({
        layout: { order: ['skills', 'experience'], hidden: ['education'] },
      })
      .expect(200);

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    const layout = after.layout as { order: string[]; hidden: string[] };

    expect(layout.order.slice(0, 2)).toEqual(['skills', 'experience']);
    // Khoá thiếu được nối vào cuối chứ không biến mất.
    expect(layout.order).toHaveLength(5);
    expect(layout.hidden).toEqual(['education']);
  });

  test('bố cục đã lưu được dùng khi xem trước', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({ layout: { hidden: ['education'] } })
      .expect(200);

    const response = await request(harness.server)
      .get(`/api/documents/${document.id}/preview`)
      .set(auth())
      .expect(200);

    expect(response.text).not.toContain('ĐH Kinh tế Đà Nẵng');
    expect(response.text).toContain('Kế toán tổng hợp');
  });

  test('xem trước bản nháp KHÔNG ghi gì vào database', async () => {
    const document = await seedDoneCv();

    const response = await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .set(auth())
      .send({
        content: { ...CV_CONTENT, profileStatement: 'CHU-NHAP-CHUA-LUU' },
      })
      .expect(200);

    expect(response.text).toContain('CHU-NHAP-CHUA-LUU');

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect((after.content as typeof CV_CONTENT).profileStatement).toBe(
      CV_CONTENT.profileStatement,
    );
  });

  test('xem trước bản nháp gộp được cả mẫu lẫn bố cục', async () => {
    const document = await seedDoneCv();

    const response = await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .set(auth())
      .send({
        templateId: 'trang-trong',
        layout: { hidden: ['skills'] },
      })
      .expect(200);

    expect(response.text).toContain('Noto Serif');
    expect(response.text).not.toContain('Misa');
  });

  test('thêm một dòng RỖNG vẫn xem trước được', async () => {
    /*
     * Bấm "Thêm kinh nghiệm" sinh ra `{ position: '', company: '', ... }`. Bản đầu
     * đặt `min(1)` cho chức danh nên vừa bấm Thêm là bản xem trước đứng im kèm 400 -
     * người dùng phải gõ xong mới thấy lại CV của mình.
     */
    const document = await seedDoneCv();

    const response = await request(harness.server)
      .post(`/api/documents/${document.id}/preview`)
      .set(auth())
      .send({
        content: {
          ...CV_CONTENT,
          experiences: [
            ...CV_CONTENT.experiences,
            {
              position: '',
              company: '',
              location: '',
              period: '',
              bullets: [],
            },
          ],
          educations: [
            ...CV_CONTENT.educations,
            { degree: '', institution: '', period: '', detail: '' },
          ],
        },
      })
      .expect(200);

    // Dòng rỗng KHÔNG được vẽ ra: một khối kinh nghiệm trắng đọc như lỗi trình bày.
    expect(response.text).toContain('Kế toán tổng hợp');
    expect(response.text.match(/class="entry"/g)).toHaveLength(2);
  });

  test('dòng rỗng vẫn được LƯU để người dùng quay lại còn thấy', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({
        content: {
          ...CV_CONTENT,
          experiences: [
            ...CV_CONTENT.experiences,
            {
              position: '',
              company: '',
              location: '',
              period: '',
              bullets: [],
            },
          ],
        },
      })
      .expect(200);

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });

    expect((after.content as typeof CV_CONTENT).experiences).toHaveLength(2);
  });

  test.each([
    ['chữ quá dài', { profileStatement: 'x'.repeat(700) }],
    ['sai kiểu', { coreCompetencies: 'khong-phai-mang' }],
    ['quá nhiều mục', { experiences: Array.from({ length: 13 }, () => ({})) }],
  ])('từ chối nội dung %s', async (_label, patch) => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set(auth())
      .send({ content: { ...CV_CONTENT, ...patch } })
      .expect(400);
  });

  test('không sửa được CV của người khác', async () => {
    const document = await seedDoneCv();
    const other = await harness.signUp();

    await request(harness.server)
      .put(`/api/documents/${document.id}/cv`)
      .set({ Authorization: `Bearer ${other.token}` })
      .send({ content: CV_CONTENT })
      .expect(404);
  });

  test('thư xin việc chưa sửa được bằng đường này', async () => {
    const letter = await harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'COVER_LETTER',
        title: 'Thư xin việc',
        status: 'DONE',
        content: { salutation: 'Kính gửi' },
      },
    });

    await request(harness.server)
      .put(`/api/documents/${letter.id}/cv`)
      .set(auth())
      .send({ content: CV_CONTENT })
      .expect(422);
  });
});
