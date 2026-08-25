import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Render lại `.tex` từ nội dung đã lưu, KHÔNG gọi model.
 *
 * Vì sao đường này tồn tại: sau khi sửa lỗi macro liên hệ rỗng trong template
 * (`\phone[mobile]{}` làm tên icon fontawesome lọt vào lớp text PDF mà ATS đọc), mọi
 * `.tex` sinh trước đó vẫn mang lỗi — và lúc ấy cách duy nhất để sửa chúng là gọi lại
 * model, tức là tốn một lượt gọi cho một thứ chẳng liên quan gì tới model.
 *
 * Phép khẳng định trung tâm của cả spec: **`FakeAi` không được gọi**. Nếu nó bị gọi,
 * nó ném lỗi vì không có dữ liệu xếp sẵn — nên test đỏ ngay chứ không âm thầm đốt hạn
 * mức ở production.
 */
const CV_CONTENT = {
  profileStatement: 'Kỹ sư backend 5 năm kinh nghiệm.',
  coreCompetencies: ['NestJS', 'PostgreSQL'],
  experiences: [
    {
      position: 'Senior Backend Engineer',
      company: 'Digistore',
      location: 'Hà Nội',
      period: '2022 - nay',
      bullets: ['Giảm tỉ lệ giao dịch lỗi từ 4,1% xuống 0,8%.'],
    },
  ],
  educations: [
    {
      degree: 'Kỹ sư',
      institution: 'ĐH Bách khoa Hà Nội',
      period: '2015 - 2019',
      detail: '',
    },
  ],
  skillGroups: [{ label: 'Ngôn ngữ', items: ['TypeScript'] }],
};

describe('Render lại tài liệu không gọi AI', () => {
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

  /// Tạo một tài liệu CV đã DONE, kèm `content` — đúng trạng thái của tài liệu cũ
  /// sinh ra trước khi template được sửa.
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

  test('render lại thành công và KHÔNG gọi model', async () => {
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/rerender`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    // Phép khẳng định trung tâm: FakeAi ném lỗi khi bị gọi mà không có dữ liệu xếp
    // sẵn, nên nếu đường này gọi model thì request trên đã không trả 200.
    const tex = await request(harness.server)
      .get(`/api/documents/${document.id}/source`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(tex.text).toContain('Senior Backend Engineer');
    expect(tex.text).toContain('Digistore');
    // Dấu tiếng Việt phải sống qua vòng render.
    expect(tex.text).toContain('ĐH Bách khoa Hà Nội');
  });

  test('KHÔNG đổi modelId lẫn generatedAt', async () => {
    /*
     * Hai trường này nói về LƯỢT GỌI MODEL, mà lượt đó không hề chạy lại. Đổi chúng
     * sẽ làm mất dấu vết model nào đã sinh ra nội dung này — và `ai_calls` cũng không
     * có bản ghi nào khớp với mốc thời gian mới.
     */
    const document = await seedDoneCv();

    await request(harness.server)
      .put(`/api/documents/${document.id}/rerender`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const after = await harness.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });

    expect(after.modelId).toBe('deepseek-v4-flash-free');
    expect(after.generatedAt?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(after.content).toEqual(CV_CONTENT);
  });

  test('render lại HAI LẦN cho ra cùng kết quả', async () => {
    // Render là hàm tất định của `content`; đó là lý do route dùng PUT.
    const document = await seedDoneCv();
    const url = `/api/documents/${document.id}/rerender`;

    await request(harness.server)
      .put(url)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const first = await request(harness.server)
      .get(`/api/documents/${document.id}/source`)
      .set('Authorization', `Bearer ${user.token}`);

    await request(harness.server)
      .put(url)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const second = await request(harness.server)
      .get(`/api/documents/${document.id}/source`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(second.text).toBe(first.text);
  });

  test('tài liệu chưa DONE thì bị từ chối, không render nửa vời', async () => {
    const document = await harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'CV',
        title: 'CV đang chạy',
        status: 'PENDING',
      },
    });

    const response = await request(harness.server)
      .put(`/api/documents/${document.id}/rerender`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(422);

    expect((response.body as { message: string }).message).toMatch(/PENDING/);
  });

  test('FORM_ANSWER không có bản LaTeX nên bị từ chối rõ ràng', async () => {
    const document = await harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'FORM_ANSWER',
        title: 'Vì sao bạn ứng tuyển?',
        status: 'DONE',
        content: { text: 'Vì tôi thích công ty này.' },
      },
    });

    const response = await request(harness.server)
      .put(`/api/documents/${document.id}/rerender`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(422);

    expect((response.body as { message: string }).message).toMatch(
      /không có bản LaTeX/i,
    );
  });

  test('không render lại được tài liệu của người khác', async () => {
    const document = await seedDoneCv();
    const other = await harness.signUp();

    await request(harness.server)
      .put(`/api/documents/${document.id}/rerender`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);
  });
});
