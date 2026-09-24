import { ReconcileService } from 'src/modules/reconcile/services/reconcile.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { QueueService } from 'src/modules/queue/queue.service.js';

/// Việc nền chỉ chuyển sang FAILED từ trong khối `catch` của chính worker. Tiến
/// trình chết giữa chừng - deploy, restart - thì không `catch` nào chạy, và bản
/// ghi nằm PENDING/RUNNING vĩnh viễn.
///
/// Tới 2026-09-23 chỉ ba bảng được nhặt. Bốn bảng còn lại kẹt im lặng, và
/// `ProfileDraft` là NGÕ CỤT thật: `retry()` chỉ nhận FAILED nên người dùng bấm
/// chạy lại bao nhiêu lần cũng nhận 400 "đang ở trạng thái RUNNING".

type UpdateManyArgs = { where: { status: { in: string[] } }; data: unknown };

/** Mỗi bảng ghi lại đúng `where` nó nhận, để khẳng định được nó CÓ bị quét. */
function fakePrisma(counts: Record<string, number> = {}) {
  const calls: Record<string, UpdateManyArgs> = {};
  const updateMany = (table: string) =>
    jest.fn<Promise<{ count: number }>, [UpdateManyArgs]>((args) => {
      calls[table] = args;
      return Promise.resolve({ count: counts[table] ?? 0 });
    });

  return {
    calls,
    prisma: {
      document: { findMany: jest.fn().mockResolvedValue([]) },
      jobMatch: { findMany: jest.fn().mockResolvedValue([]) },
      agentRun: { updateMany: updateMany('agentRun') },
      upskillReport: { updateMany: updateMany('upskillReport') },
      interviewPrep: { updateMany: updateMany('interviewPrep') },
      profileDraft: { updateMany: updateMany('profileDraft') },
      jobRequirement: { updateMany: updateMany('jobRequirement') },
    },
  };
}

const fakeQueue = () =>
  ({ sendMany: jest.fn().mockResolvedValue(0) }) as unknown as QueueService;

const build = (counts?: Record<string, number>) => {
  const { calls, prisma } = fakePrisma(counts);
  const service = new ReconcileService(
    prisma as unknown as PrismaService,
    fakeQueue(),
  );
  return { calls, prisma, service };
};

describe('ReconcileService.failStuck', () => {
  test('quét đủ NĂM bảng có thể kẹt, không sót bảng nào', async () => {
    const { calls, service } = build();

    await service.run();

    expect(Object.keys(calls).sort()).toEqual([
      'agentRun',
      'interviewPrep',
      'jobRequirement',
      'profileDraft',
      'upskillReport',
    ]);
  });

  test('bắt cả PENDING lẫn RUNNING — chết trước khi kịp đổi sang RUNNING cũng là rơi', async () => {
    const { calls, service } = build();

    await service.run();

    for (const args of Object.values(calls)) {
      expect(args.where.status.in.sort()).toEqual(['PENDING', 'RUNNING']);
    }
  });

  test('đánh FAILED kèm câu nói rõ nguyên nhân và việc cần làm', async () => {
    const { calls, service } = build();

    await service.run();

    const data = calls.profileDraft.data as { status: string; error: string };
    expect(data.status).toBe('FAILED');
    expect(data.error).toMatch(/khởi động lại/);
    expect(data.error).toMatch(/chạy lại/);
  });

  /// `UpskillReport` không có cột `updatedAt`, chỉ `createdAt`. Dùng nhầm tên
  /// cột thì Prisma ném lúc chạy, mà đường này chỉ chạy khi có việc kẹt thật.
  test('UpskillReport lọc theo createdAt, các bảng khác theo updatedAt', async () => {
    const { calls, service } = build();

    await service.run();

    expect(calls.upskillReport.where).toHaveProperty('createdAt');
    expect(calls.upskillReport.where).not.toHaveProperty('updatedAt');
    expect(calls.profileDraft.where).toHaveProperty('updatedAt');
  });

  test('đếm riêng từng bảng để biết chỗ nào đang rơi việc', async () => {
    const { service } = build({
      agentRun: 1,
      upskillReport: 2,
      interviewPrep: 3,
      profileDraft: 4,
      jobRequirement: 5,
    });

    await expect(service.run()).resolves.toMatchObject({
      agentRuns: 1,
      upskillReports: 2,
      interviewPreps: 3,
      profileDrafts: 4,
      jobRequirements: 5,
    });
  });
});
