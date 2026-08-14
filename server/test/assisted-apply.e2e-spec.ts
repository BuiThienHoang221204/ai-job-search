import request from 'supertest';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import { BROWSER_IMAGE } from 'src/modules/apply/browser-apply.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Assisted Apply — Agent 7 của đề tài, qua HTTP thật.
 *
 * `FakeSandbox` thay Docker, nên spec này kiểm được **không cần ảnh 3,54GB và không
 * cần Internet**. Đó chính là việc SEAM 2 được dựng ra để làm, và ở đây nó còn quan
 * trọng hơn ở đường LaTeX: bản thật của đường này mở một trang web của người khác,
 * nên nếu để nó thật thì bộ e2e sẽ đỏ mỗi khi trang đó đổi HTML hay ngừng hoạt động.
 *
 * Điều spec này KHÔNG kiểm, và phải nói rõ: **chất lượng điền form thật**. Việc đó
 * được kiểm bằng `scripts/probe-assisted-apply.mjs` chạy tay trên form công khai.
 */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);

/// Báo cáo mà script trong trang ghi ra. Giữ đúng hình dạng `PageReport`.
const report = (extra: Record<string, unknown> = {}): Buffer =>
  Buffer.from(
    JSON.stringify({
      reachable: true,
      status: 200,
      visibleInputs: 5,
      hasFileInput: true,
      loginHints: [],
      filled: [{ label: 'Email*', value: 'a@b.local' }],
      unmatched: ['Country*'],
      error: null,
      ...extra,
    }),
  );

describe('Assisted Apply', () => {
  let harness: TestApp;
  let user: TestUser;
  let jobId: string;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
    const job = await harness.prisma.job.create({
      data: {
        source: 'greenhouse',
        externalId: `gh-${Date.now()}`,
        url: 'https://job-boards.greenhouse.io/acme/jobs/1',
        title: 'Backend Engineer',
        company: 'ACME',
        description: 'Mô tả công việc.',
      },
      select: { id: true },
    });
    jobId = job.id;
  });

  /// `response.body` của supertest là `any`. Bóc kiểu ở MỘT chỗ thay vì ép kiểu rải
  /// rác: eslint chặn `no-unsafe-member-access`, và chặn đúng — một field đổi tên mà
  /// vẫn `any` thì test xanh trong khi API đã vỡ.
  const attemptIdOf = (response: { body: unknown }): string =>
    (response.body as { attemptId: string }).attemptId;

  const start = (as: TestUser = user) =>
    request(harness.server)
      .post('/api/apply-attempts')
      .query({ jobId })
      .set('Authorization', `Bearer ${as.token}`);

  describe('đường GHI', () => {
    test('trả BIÊN NHẬN và xếp việc, chưa chạy gì', async () => {
      const response = await start().expect(201);

      // Khẳng định TOÀN BỘ hình dạng, không chỉ một trường: đường GHI chỉ được trả
      // biên nhận. Lộ thêm dữ liệu ở đây là lộ âm thầm.
      expect(Object.keys(response.body as object)).toEqual(['attemptId']);
      expect(attemptIdOf(response)).toEqual(expect.any(String));
      expect(harness.queue.sentTo(QUEUE.APPLY_ASSIST)).toEqual([
        { attemptId: attemptIdOf(response) },
      ]);
      // Chưa drain thì worker chưa chạy: sandbox phải chưa được gọi lần nào.
      expect(harness.sandbox.calls).toHaveLength(0);

      const attempt = await harness.prisma.applyAttempt.findUniqueOrThrow({
        where: { id: attemptIdOf(response) },
      });
      expect(attempt.status).toBe('PENDING');
      expect(attempt.outcome).toBeNull();
    });

    test('bấm hai lần chỉ xếp MỘT việc', async () => {
      // Khoá dedup là `attemptId`, nên hai lần bấm tạo hai bản ghi và hai việc —
      // đúng như vậy: mỗi lượt là một lần chạy riêng, người dùng có thể sửa hồ sơ
      // rồi thử lại. Nhưng xếp LẠI cùng một attemptId thì phải bị chặn.
      const first = await start().expect(201);
      const again = await harness.queue.send(QUEUE.APPLY_ASSIST, {
        attemptId: attemptIdOf(first),
      });
      expect(again).toBeNull();
    });

    test('tin không có link thì 400 ngay, không xếp việc', async () => {
      const noUrl = await harness.prisma.job.create({
        data: {
          source: 'greenhouse',
          externalId: 'gh-no-url',
          url: '',
          title: 'Không link',
          company: 'ACME',
          description: 'x',
        },
        select: { id: true },
      });

      await request(harness.server)
        .post('/api/apply-attempts')
        .query({ jobId: noUrl.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(400);

      expect(harness.queue.sentTo(QUEUE.APPLY_ASSIST)).toHaveLength(0);
    });

    test('thiếu jobId thì 400', async () => {
      await request(harness.server)
        .post('/api/apply-attempts')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(400);
    });

    test('KHÔNG có route nào nộp hồ sơ', async () => {
      /*
       * Ghim bằng một phép thử thật thay vì bằng một lời hứa trong tài liệu: máy
       * không được bấm nút nộp, nên không được có đường HTTP nào làm việc đó.
       */
      const created = await start().expect(201);
      await request(harness.server)
        .post(`/api/apply-attempts/${attemptIdOf(created)}/submit`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });
  });

  describe('worker', () => {
    test('truyền đúng spec xuống sandbox, và CÓ MẠNG', async () => {
      harness.sandbox.willReturn({
        artifacts: { 'report.json': report(), 'screenshot.png': PNG },
      });

      await start().expect(201);
      await harness.queue.drain();

      const spec = harness.sandbox.calls[0];
      expect(spec.image).toBe(BROWSER_IMAGE);
      // Đường DUY NHẤT trong hệ thống được mở mạng — trình duyệt phải tải được trang.
      expect(spec.network).toBe('egress');
      expect(spec.command).toEqual(['node', 'apply.mjs']);
      expect(spec.artifacts).toContain('screenshot.png');
      expect(spec.artifacts).toContain('report.json');
      // Chromium cần nhiều RAM hơn mức mặc định 512MB của sandbox.
      expect(spec.limits?.memoryMb).toBeGreaterThanOrEqual(1024);
    });

    test('script gửi vào sandbox KHÔNG chứa lời gọi nộp form', async () => {
      /*
       * Phép khẳng định quan trọng nhất của cả file.
       *
       * Không kiểm chữ "submit" chung chung: script có danh sách loại input cần bỏ
       * qua, trong đó có "submit". Thứ phải không tồn tại là **lời gọi** nộp form.
       */
      harness.sandbox.willReturn({
        artifacts: { 'report.json': report() },
      });

      await start().expect(201);
      await harness.queue.drain();

      const script = String(harness.sandbox.calls[0].files['apply.mjs']);
      expect(script).not.toMatch(/\.submit\s*\(/);
      expect(script).not.toMatch(/requestSubmit/);
    });

    test('chỉ gửi 4 trường danh tính, không gửi gì khác của hồ sơ', async () => {
      /*
       * Lượt chạy này vừa mang dữ liệu hồ sơ vừa có đường ra Internet, nên danh sách
       * trắng phải được ghim: kỹ năng, mức lương mong muốn, ghi chú giấy phép lao
       * động không được rời khỏi máy chủ.
       */
      await harness.prisma.profile.update({
        where: { userId: user.id },
        data: {
          phone: '0901234567',
          location: 'Hồ Chí Minh',
          primarySkills: ['TypeScript', 'NestJS'],
          workPermitNote: 'Ghi chú riêng tư về giấy phép lao động',
        },
      });

      harness.sandbox.willReturn({
        artifacts: { 'report.json': report() },
      });

      await start().expect(201);
      await harness.queue.drain();

      const input = String(harness.sandbox.calls[0].files['input.json']);
      expect(input).toContain('0901234567');
      expect(input).toContain('Hồ Chí Minh');
      expect(input).not.toContain('TypeScript');
      expect(input).not.toContain('giấy phép lao động');
    });

    test('lưu kết quả và ảnh chụp, chuyển sang DONE', async () => {
      harness.sandbox.willReturn({
        artifacts: { 'report.json': report(), 'screenshot.png': PNG },
      });

      const created = await start().expect(201);
      await harness.queue.drain();

      const attempt = await harness.prisma.applyAttempt.findUniqueOrThrow({
        where: { id: attemptIdOf(created) },
      });
      expect(attempt.status).toBe('DONE');
      expect(attempt.outcome).toBe('FILLED');
      expect(attempt.unmatched).toEqual(['Country*']);
      expect(attempt.filled).toEqual([{ label: 'Email*', value: 'a@b.local' }]);
      expect(attempt.screenshotKey).toContain(user.id);
      // Câu chữ được lưu lại, không dựng lại từ `outcome` lúc đọc: màn lịch sử phải
      // hiện đúng câu người dùng đã đọc.
      expect(attempt.message).toMatch(/tự bấm nộp/i);
    });

    test('trang đòi đăng nhập cho ra LOGIN_WALL, KHÔNG phải lỗi', async () => {
      harness.sandbox.willReturn({
        artifacts: {
          'report.json': report({
            filled: [],
            hasFileInput: false,
            loginHints: ['đăng nhập để ứng tuyển'],
          }),
          'screenshot.png': PNG,
        },
      });

      const created = await start().expect(201);
      await harness.queue.drain();

      const attempt = await harness.prisma.applyAttempt.findUniqueOrThrow({
        where: { id: attemptIdOf(created) },
      });
      // DONE, không FAILED: đây là một kết luận hợp lệ cho 4 portal Việt.
      expect(attempt.status).toBe('DONE');
      expect(attempt.outcome).toBe('LOGIN_WALL');
      expect(attempt.message).toMatch(/đăng nhập/i);
      expect(attempt.error).toBeNull();
    });

    test('sandbox hỏng vẫn cho ra kết luận cho người dùng, không để trống', async () => {
      harness.sandbox.willFail('IMAGE_MISSING');

      const created = await start().expect(201);
      await harness.queue.drain();

      const attempt = await harness.prisma.applyAttempt.findUniqueOrThrow({
        where: { id: attemptIdOf(created) },
      });
      expect(attempt.outcome).toBe('UNREACHABLE');
      expect(attempt.message).toBeTruthy();
      // Không lộ chi tiết kỹ thuật ra câu cho người dùng.
      expect(attempt.message).not.toMatch(/docker|image|sandbox/i);
    });
  });

  describe('đường ĐỌC và quyền sở hữu', () => {
    const finished = async () => {
      harness.sandbox.willReturn({
        artifacts: { 'report.json': report(), 'screenshot.png': PNG },
      });
      const created = await start().expect(201);
      await harness.queue.drain();
      return attemptIdOf(created);
    };

    test('ảnh chụp trả về PNG THẬT, không phải JSON của Buffer', async () => {
      /*
       * Ghim đúng lỗi đã trả giá ở đường PDF: trả `Buffer` trực tiếp thì Nest đem nó
       * qua bộ serialize JSON và cho ra `{"type":"Buffer","data":[...]}` với HTTP 200
       * và content-type đúng — một file hỏng trông y như file tốt.
       */
      const id = await finished();

      const response = await request(harness.server)
        .get(`/api/apply-attempts/${id}/screenshot`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('image/png');
      const png: unknown = response.body;
      expect(Buffer.isBuffer(png)).toBe(true);
      expect((png as Buffer).subarray(0, 4).toString('latin1')).toBe('\x89PNG');
    });

    test('lượt gần nhất của một tin', async () => {
      const id = await finished();

      const response = await request(harness.server)
        .get('/api/apply-attempts/latest')
        .query({ jobId })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect((response.body as { id: string }).id).toBe(id);
    });

    test('người khác KHÔNG đọc được lượt, ảnh, và không xác nhận được', async () => {
      const id = await finished();
      const other = await harness.signUp();

      await request(harness.server)
        .get(`/api/apply-attempts/${id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);

      await request(harness.server)
        .get(`/api/apply-attempts/${id}/screenshot`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);

      await request(harness.server)
        .put(`/api/apply-attempts/${id}/confirm`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(404);
    });

    test('chưa đăng nhập thì 401', async () => {
      const id = await finished();
      await request(harness.server)
        .get(`/api/apply-attempts/${id}`)
        .expect(401);
    });
  });

  describe('xác nhận đã tự nộp', () => {
    test('ghi confirmedAt, và gọi lại lần hai không đổi mốc thời gian', async () => {
      /*
       * `confirmedAt` là lời khẳng định của NGƯỜI DÙNG, không phải của hệ thống — hệ
       * thống không bấm nút nộp nên không thể tự biết. Gọi lại phải bất biến, vì
       * người dùng bấm hai lần là chuyện thường.
       */
      harness.sandbox.willReturn({
        artifacts: { 'report.json': report(), 'screenshot.png': PNG },
      });
      const created = await start().expect(201);
      await harness.queue.drain();

      const first = await request(harness.server)
        .put(`/api/apply-attempts/${attemptIdOf(created)}/confirm`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const firstAt = (first.body as { confirmedAt: string }).confirmedAt;
      expect(firstAt).toBeTruthy();

      const second = await request(harness.server)
        .put(`/api/apply-attempts/${attemptIdOf(created)}/confirm`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect((second.body as { confirmedAt: string }).confirmedAt).toBe(
        firstAt,
      );
    });
  });
});
