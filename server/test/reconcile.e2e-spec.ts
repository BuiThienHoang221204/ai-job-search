import type { MatchStatus } from 'src/generated/prisma/enums.js';
import { STALE_RUNNING_MS } from 'src/modules/matching/matching.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import {
  ReconcileService,
  STUCK_AFTER_MS,
} from 'src/modules/reconcile/reconcile.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Nhặt lại việc nền đã rơi.
///
/// Tình huống có thật mà nó xử lý: `applications.create` ghi bản ghi Document rồi
/// mới gửi message vào hàng đợi, và hai bước đó không thể nằm trong cùng một
/// transaction (pg-boss dùng connection pool riêng). Nếu tiến trình chết giữa hai
/// bước thì bản ghi ở `PENDING` mãi mãi và người dùng thấy "đang sinh..." không
/// bao giờ xong.
describe('Nhặt việc nền bị rơi', () => {
  let harness: TestApp;
  let reconcile: ReconcileService;
  let user: TestUser;
  let jobId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    reconcile = harness.app.get(ReconcileService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();

    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: 'tin-reconcile',
        url: 'https://example.test/tin-reconcile',
        title: 'Backend Developer',
        company: 'Công ty Thử Nghiệm',
        description:
          'Tuyển Backend Developer biết NestJS và PostgreSQL, tối thiểu hai năm kinh nghiệm.',
        tags: ['NestJS'],
      },
    });
    jobId = job.id;
  });

  /// Tạo tài liệu ở một trạng thái và lùi `updatedAt` về quá khứ.
  ///
  /// Phải lùi bằng SQL thô: `updatedAt` khai `@updatedAt` nên Prisma luôn ghi đè
  /// bằng thời điểm hiện tại, không nhận giá trị truyền vào.
  const documentAged = async (
    status: MatchStatus,
    minutesAgo: number,
  ): Promise<string> => {
    const document = await harness.prisma.document.create({
      data: { userId: user.id, jobId, kind: 'CV', title: 'CV thử', status },
    });
    await harness.prisma.$executeRawUnsafe(
      `UPDATE "documents" SET "updatedAt" = now() - ($2 || ' minutes')::interval WHERE "id" = $1`,
      document.id,
      String(minutesAgo),
    );
    return document.id;
  };

  const matchAged = async (
    status: MatchStatus,
    minutesAgo: number,
  ): Promise<void> => {
    await harness.prisma.jobMatch.create({
      data: { userId: user.id, jobId, status },
    });
    await harness.prisma.$executeRawUnsafe(
      `UPDATE "job_matches" SET "updatedAt" = now() - ($3 || ' minutes')::interval
        WHERE "userId" = $1 AND "jobId" = $2`,
      user.id,
      jobId,
      String(minutesAgo),
    );
  };

  const documentsQueued = () =>
    harness.queue.sentTo(QUEUE.GENERATE_DOCUMENT) as {
      documentId: string;
    }[];

  test('tài liệu PENDING quá lâu được xếp lại', async () => {
    const documentId = await documentAged('PENDING', 30);

    const result = await reconcile.run();

    expect(result.documents).toBe(1);
    expect(documentsQueued().map((p) => p.documentId)).toEqual([documentId]);
  });

  /// RUNNING quá lâu nghĩa là worker đã chết giữa đường, không phải đang làm:
  /// một lượt sinh tài liệu bị cắt ở 90 giây.
  test('tài liệu RUNNING quá lâu cũng được xếp lại', async () => {
    const documentId = await documentAged('RUNNING', 30);

    await reconcile.run();

    expect(documentsQueued().map((p) => p.documentId)).toEqual([documentId]);
  });

  test('tài liệu PENDING nhưng còn mới thì để yên', async () => {
    await documentAged('PENDING', 1);

    const result = await reconcile.run();

    expect(result.documents).toBe(0);
    expect(documentsQueued()).toEqual([]);
  });

  /// FAILED là trạng thái CUỐI mà người dùng bấm lại được. Tự động thử lại khi
  /// chưa có bộ đếm số lần thử sẽ biến một dữ liệu vào hỏng vĩnh viễn thành vòng
  /// lặp tốn tiền, nên đây là quyết định có chủ đích chứ không phải bỏ sót.
  test('tài liệu FAILED KHÔNG được tự xếp lại', async () => {
    await documentAged('FAILED', 30);

    const result = await reconcile.run();

    expect(result.documents).toBe(0);
  });

  test('tài liệu DONE thì không đụng tới', async () => {
    await documentAged('DONE', 30);

    const result = await reconcile.run();

    expect(result.documents).toBe(0);
  });

  test('lượt chấm RUNNING quá lâu được xếp lại', async () => {
    await matchAged('RUNNING', 30);

    const result = await reconcile.run();

    expect(result.matches).toBe(1);
    expect(harness.queue.sentTo(QUEUE.EVALUATE_MATCH)).toEqual([
      { userId: user.id, jobId },
    ]);
  });

  /// Ràng buộc giữa hai ngưỡng, kiểm bằng hành vi thay vì đọc hằng số.
  ///
  /// `MatchingService.claim()` chỉ nhường quyền cho một hàng RUNNING sau
  /// `STALE_RUNNING_MS` (5 phút). Nếu reconcile xếp lại sớm hơn thế thì message
  /// gửi đi sẽ bị `claim()` từ chối - tốn một lượt để không làm gì, và log báo
  /// "đã xếp lại" trong khi thực tế không có gì chạy.
  test('không xếp lại lượt chấm còn trong cửa sổ thoát của matching', async () => {
    const withinEscapeWindow = Math.floor(STALE_RUNNING_MS / 60_000) + 1;
    expect(withinEscapeWindow * 60_000).toBeLessThan(STUCK_AFTER_MS);

    await matchAged('RUNNING', withinEscapeWindow);

    const result = await reconcile.run();

    expect(result.matches).toBe(0);
  });

  test('xếp lại cả tài liệu và lượt chấm trong một lượt', async () => {
    await documentAged('PENDING', 30);
    await matchAged('RUNNING', 30);

    const result = await reconcile.run();

    expect(result).toMatchObject({ documents: 1, matches: 1, deferred: 0 });
  });

  /// Chạy nhiều lần phải an toàn: cron gọi 10 phút một lần và admin bấm tay được,
  /// nên hai lượt gần nhau là chuyện thường. Hàng đợi chặn trùng theo khoá nên
  /// lượt thứ hai không xếp thêm gì khi việc cũ vẫn đang chờ.
  test('chạy hai lần không xếp trùng', async () => {
    await documentAged('PENDING', 30);

    const first = await reconcile.run();
    const second = await reconcile.run();

    expect(first.documents).toBe(1);
    expect(second.documents).toBe(0);
    expect(documentsQueued()).toHaveLength(1);
  });

  test('không có việc rơi thì không xếp gì', async () => {
    const result = await reconcile.run();

    expect(result).toEqual({ documents: 0, matches: 0, deferred: 0 });
    expect(harness.queue.sent).toEqual([]);
  });
});
