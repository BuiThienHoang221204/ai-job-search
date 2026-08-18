import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Hợp đồng dữ liệu của màn quản trị.
 *
 * Vì sao spec này tồn tại: cùng một lỗi đã xảy ra BA lần trên repo này — giao
 * diện khai một interface có trường mà API không hề trả (`UpskillReportRecord`
 * khai `softGaps`/`roadmap`, `InterviewPrepRecord` thiếu `job`, và
 * `AiFailureRecord` khai `id` cùng `provider` trong khi `select` của
 * `recentFailures` bỏ cả hai).
 *
 * TypeScript không thể bắt loại lỗi này: giao diện parse JSON `unknown`, nên một
 * trường khai thừa vẫn hợp kiểu và chỉ trở thành `undefined` lúc chạy. Hậu quả
 * lần gần nhất là mọi hàng của bảng "Lần hỏng gần nhất" nhận `key={undefined}`
 * và cột model hiện "· gpt-…" với chỗ trống trước dấu chấm giữa.
 *
 * Nên phép khẳng định ở đây so TẬP KHOÁ CHÍNH XÁC, không phải "có chứa". So
 * "có chứa" bắt được trường bị bỏ nhưng không bắt được trường mới lặng lẽ thêm
 * vào — mà thêm vào một endpoint quản trị chính là đường làm lộ dữ liệu.
 */
const AI_FAILURE_FIELDS = [
  'createdAt',
  'durationMs',
  'errorMessage',
  'failureKind',
  'id',
  'modelId',
  'provider',
  'purpose',
] as const;

describe('Hợp đồng dữ liệu màn quản trị', () => {
  let harness: TestApp;
  let admin: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    admin = await harness.signUp();
    await harness.promoteToAdmin(admin.id);
  });

  test('GET /admin/ai-failures trả đúng tập trường giao diện đang đọc', async () => {
    await harness.prisma.aiCall.create({
      data: {
        purpose: 'upskill.report',
        provider: 'opencode',
        modelId: 'deepseek-v4-flash-free',
        ok: false,
        failureKind: 'TIMEOUT',
        errorMessage: 'The operation was aborted due to timeout',
        durationMs: 90_000,
      },
    });

    const response = await request(harness.server)
      .get('/api/admin/ai-failures')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const page = response.body as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    const rows = page.items;
    expect(rows).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(Object.keys(rows[0]).sort()).toEqual([...AI_FAILURE_FIELDS]);

    // `id` phải là giá trị dùng được làm key của React, không phải null hay ''.
    expect(typeof rows[0].id).toBe('string');
    expect(rows[0].id).not.toBe('');
    // `provider` phải có thật: giao diện in "{provider} · {modelId}", nên thiếu
    // nó là một dấu chấm giữa lửng lơ chứ không phải một ô trống thấy được.
    expect(rows[0].provider).toBe('opencode');
  });

  test('chỉ trả về lượt gọi hỏng, không trả lượt thành công', async () => {
    await harness.prisma.aiCall.createMany({
      data: [
        {
          purpose: 'match.evaluate',
          provider: 'opencode',
          modelId: 'm',
          ok: true,
          durationMs: 1_000,
        },
        {
          purpose: 'match.evaluate',
          provider: 'opencode',
          modelId: 'm',
          ok: false,
          failureKind: 'UPSTREAM',
          errorMessage: 'Rate limit exceeded',
          durationMs: 500,
        },
      ],
    });

    const response = await request(harness.server)
      .get('/api/admin/ai-failures')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const page = response.body as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.items[0].failureKind).toBe('UPSTREAM');
  });

  test('tài khoản thường không đọc được', async () => {
    const user = await harness.signUp();
    await request(harness.server)
      .get('/api/admin/ai-failures')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);
  });
});
