import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Mail ứng tuyển viết từ JD DÁN TAY.
 *
 * Đường này tồn tại vì thao tác thật của người dùng là copy mô tả công việc ở
 * một nơi bất kỳ rồi nhờ AI viết mail gửi HR - tin đó không nằm trong database
 * và cũng không cần nằm ở đó.
 *
 * Hai phép khẳng định là lý do chính của cả tệp:
 *
 * 1. **Không có hàng nào được thêm vào `jobs`.** Bảng đó là kho dùng chung,
 *    không có cột chủ sở hữu, nên lưu JD dán tay vào đó là đẩy tin riêng của một
 *    người vào danh sách việc làm của tất cả mọi người.
 * 2. **Chữ ký không đi qua model.** Model chỉ viết chữ; tên, email và số điện
 *    thoại do code ghép từ hồ sơ, vì một số điện thoại bịa trong mail đã gửi đi
 *    là thứ người dùng không có cách nào phát hiện.
 */
const JOB_DESCRIPTION = [
  'Công ty TNHH Sáng Tạo tuyển Kế toán tổng hợp làm việc tại Hà Nội.',
  'Yêu cầu: tối thiểu hai năm kinh nghiệm kế toán tổng hợp, thành thạo Excel và phần mềm Misa,',
  'nắm vững quy định thuế hiện hành, có khả năng lập báo cáo tài chính cuối kỳ.',
].join(' ');

const EMAIL_CONTENT = {
  subject: 'Ứng tuyển vị trí Kế toán tổng hợp - Người dùng thử nghiệm',
  greeting: 'Kính gửi Bộ phận Tuyển dụng Công ty TNHH Sáng Tạo,',
  paragraphs: [
    'Tôi ứng tuyển vị trí Kế toán tổng hợp với hai năm làm việc trực tiếp trên phần mềm Misa.',
    'Ở công việc gần nhất tôi phụ trách báo cáo tài chính cuối kỳ cho một đơn vị hơn 40 nhân sự.',
  ],
  attachmentNote: 'CV chi tiết của tôi được đính kèm trong thư này.',
  closing: 'Rất mong nhận được phản hồi của quý công ty.',
  signOff: 'Trân trọng,',
};

describe('Mail ứng tuyển từ JD dán tay', () => {
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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const pasteJd = (body: Record<string, unknown>) =>
    request(harness.server)
      .post('/api/documents/application-email')
      .set(auth(user.token))
      .send(body);

  const pasteValidJd = () =>
    pasteJd({
      jobDescription: JOB_DESCRIPTION,
      company: 'Công ty TNHH Sáng Tạo',
      title: 'Kế toán tổng hợp',
    });

  test('dán JD rồi sinh mail, KHÔNG tạo tin tuyển dụng nào', async () => {
    harness.ai.willReturn(EMAIL_CONTENT);

    const created = await pasteValidJd().expect(201);
    const { documentId } = created.body as { documentId: string };

    await harness.queue.drain();

    const response = await request(harness.server)
      .get(`/api/documents/${documentId}`)
      .set(auth(user.token))
      .expect(200);

    const record = response.body as {
      status: string;
      jobId: string | null;
      title: string;
      storageKey: string | null;
      content: { subject: string; paragraphs: string[] };
    };

    expect(record.status).toBe('DONE');
    expect(record.content.subject).toBe(EMAIL_CONTENT.subject);
    expect(record.content.paragraphs).toHaveLength(2);
    expect(record.title).toBe(
      'Mail ứng tuyển: Kế toán tổng hợp - Công ty TNHH Sáng Tạo',
    );

    // JD dán tay không gắn với tin nào, và mail không bao giờ đi qua LaTeX.
    expect(record.jobId).toBeNull();
    expect(record.storageKey).toBeNull();

    // Phép khẳng định trung tâm: kho việc làm dùng chung vẫn sạch.
    expect(await harness.prisma.job.count()).toBe(0);
  });

  test('mô tả công việc dán tay đi vào prompt', async () => {
    harness.ai.willReturn(EMAIL_CONTENT);

    await pasteValidJd().expect(201);
    await harness.queue.drain();

    const call = harness.ai.calls.at(-1);
    expect(call?.purpose).toBe('document.applicationEmail');
    expect(call?.userId).toBe(user.id);
    expect(call?.prompt).toContain('Misa');
    expect(call?.prompt).toContain('Kế toán tổng hợp @ Công ty TNHH Sáng Tạo');
    // Tên ứng viên phải có mặt: tiêu đề mail được yêu cầu mang tên người gửi,
    // mà tên nằm ở bảng `users` chứ không nằm trong tóm tắt hồ sơ.
    expect(call?.prompt).toContain('Tên ứng viên');
  });

  test('chữ ký ghép từ hồ sơ chứ không do model viết', async () => {
    await harness.prisma.profile.update({
      where: { userId: user.id },
      data: { phone: '0901234567', headline: 'Kế toán tổng hợp 2 năm' },
    });
    harness.ai.willReturn(EMAIL_CONTENT);

    const created = await pasteValidJd().expect(201);
    const { documentId } = created.body as { documentId: string };
    await harness.queue.drain();

    const response = await request(harness.server)
      .get(`/api/documents/${documentId}`)
      .set(auth(user.token))
      .expect(200);

    const content = (
      response.body as {
        content: {
          signature: { name: string; email: string; phone: string | null };
        };
      }
    ).content;

    // Model không hề trả về trường nào trong số này - `EMAIL_CONTENT` không có
    // `signature`, nên nếu nó rỗng thì chữ ký đã phụ thuộc vào model.
    expect(content.signature.phone).toBe('0901234567');
    expect(content.signature.email).toBe(user.email);
    expect(content.signature.name).toBeTruthy();
  });

  test('dán JD mà thiếu tên công ty thì bị chặn ngay, không gọi model', async () => {
    const response = await pasteJd({
      jobDescription: JOB_DESCRIPTION,
      title: 'Kế toán tổng hợp',
    }).expect(400);

    expect(JSON.stringify(response.body)).toMatch(/công ty/i);
    // FakeAi không có dữ liệu xếp sẵn; nếu đường này gọi model thì nó đã ném lỗi.
    expect(harness.ai.calls).toHaveLength(0);
  });

  test('JD quá ngắn thì bị từ chối', async () => {
    const response = await pasteJd({
      jobDescription: 'Tuyển kế toán.',
      company: 'Công ty TNHH Sáng Tạo',
      title: 'Kế toán tổng hợp',
    }).expect(400);

    expect(JSON.stringify(response.body)).toMatch(/quá ngắn/i);
  });

  test('không có JD lẫn jobId thì bị từ chối', async () => {
    await pasteJd({}).expect(400);
  });

  test('jobId không tồn tại thì báo 404 chứ không tạo bản ghi', async () => {
    await pasteJd({ jobId: 'khong-co-that' }).expect(404);
    expect(await harness.prisma.document.count()).toBe(0);
  });

  test('chọn tin có sẵn thì mail viết theo mô tả trong database', async () => {
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: 'tin-ke-toan',
        url: 'https://example.test/tin-ke-toan',
        title: 'Kế toán tổng hợp',
        company: 'Công ty Cổ phần Thử Nghiệm',
        description: 'Tuyển kế toán tổng hợp thành thạo Misa và Excel.',
      },
    });
    harness.ai.willReturn(EMAIL_CONTENT);

    const created = await pasteJd({ jobId: job.id }).expect(201);
    const { documentId } = created.body as { documentId: string };
    await harness.queue.drain();

    const record = await harness.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });

    expect(record.jobId).toBe(job.id);
    expect(record.status).toBe('DONE');
    expect(record.title).toBe(
      'Mail ứng tuyển: Kế toán tổng hợp - Công ty Cổ phần Thử Nghiệm',
    );
    expect(harness.ai.calls.at(-1)?.prompt).toContain(
      'Tuyển kế toán tổng hợp thành thạo Misa và Excel.',
    );
  });

  test('không đọc được mail của người khác', async () => {
    harness.ai.willReturn(EMAIL_CONTENT);
    const created = await pasteValidJd().expect(201);
    const { documentId } = created.body as { documentId: string };

    const other = await harness.signUp();

    await request(harness.server)
      .get(`/api/documents/${documentId}`)
      .set(auth(other.token))
      .expect(404);
  });

  test('mail không có bản LaTeX nên render lại bị từ chối rõ ràng', async () => {
    harness.ai.willReturn(EMAIL_CONTENT);
    const created = await pasteValidJd().expect(201);
    const { documentId } = created.body as { documentId: string };
    await harness.queue.drain();

    const response = await request(harness.server)
      .put(`/api/documents/${documentId}/rerender`)
      .set(auth(user.token))
      .expect(422);

    expect((response.body as { message: string }).message).toMatch(
      /không có bản LaTeX/i,
    );
  });
});
