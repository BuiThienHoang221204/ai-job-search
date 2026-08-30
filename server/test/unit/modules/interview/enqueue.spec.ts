/*
 * `InterviewService` nạp `AiService`, mà `AiService` nạp `ai` và
 * `@ai-sdk/openai-compatible` - hai package ESM thuần jest không `require()`
 * được. `enqueue` không chạm tới model nên chặn ở tầng module là đủ.
 */
jest.mock('ai', () => ({}));
jest.mock('@ai-sdk/openai-compatible', () => ({}));

import type { MatchStatus } from 'src/generated/prisma/enums.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { QueueService } from 'src/modules/queue/queue.service.js';
import { InterviewService } from 'src/modules/interview/interview.service.js';

type PrepRow = { status: MatchStatus } | null;

/** Ghi lại mọi lượt ghi để test đọc được thứ THẬT SỰ định lưu. */
function fakes(existing: PrepRow, sendFails = false) {
  const upserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];

  const prisma = {
    job: { findUnique: jest.fn(() => Promise.resolve({ id: 'job-1' })) },
    interviewPrep: {
      findUnique: jest.fn(() => Promise.resolve(existing)),
      upsert: jest.fn((args: { update: Record<string, unknown> }) => {
        upserts.push(args.update);
        return Promise.resolve({});
      }),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return Promise.resolve({});
      }),
    },
  } as unknown as PrismaService;

  const send = jest.fn(() =>
    sendFails
      ? Promise.reject(new Error('hàng đợi chết'))
      : Promise.resolve('queue-1'),
  );
  const queue = { send } as unknown as QueueService;

  const service = new InterviewService(
    prisma,
    null as never,
    null as never,
    null as never,
    queue,
  );

  return { service, send, upserts, updates };
}

describe('InterviewService.enqueue', () => {
  it('ghi bản ghi PENDING NGAY khi xếp hàng, không đợi worker', async () => {
    const { service, upserts, send } = fakes(null);

    const result = await service.enqueue('user-1', 'job-1', false);

    expect(upserts).toEqual([{ status: 'PENDING', error: null }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ queued: true, queueJobId: 'queue-1' });
  });

  /// Hạ một bản đã xong xuống PENDING là nói dối: `generate` sẽ trả luôn bản cũ
  /// mà không gọi model, nên màn hình quay mãi trong khi chẳng có gì chạy.
  it('KHÔNG đụng vào bản ghi đã DONE khi không ép chạy lại', async () => {
    const { service, upserts, send } = fakes({ status: 'DONE' });

    await service.enqueue('user-1', 'job-1', false);

    expect(upserts).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ép chạy lại thì đặt bản DONE về PENDING', async () => {
    const { service, upserts } = fakes({ status: 'DONE' });

    await service.enqueue('user-1', 'job-1', true);

    expect(upserts).toEqual([{ status: 'PENDING', error: null }]);
  });

  it('bản ghi hỏng lần trước được đặt lại PENDING dù không ép', async () => {
    const { service, upserts } = fakes({ status: 'FAILED' });

    await service.enqueue('user-1', 'job-1', false);

    expect(upserts).toEqual([{ status: 'PENDING', error: null }]);
  });

  /// Không có nhánh này thì một lượt xếp hàng hỏng để lại bản ghi PENDING mồ
  /// côi, và màn hình quay vòng mãi mãi vì không worker nào sẽ chạm tới nó.
  it('xếp hàng hỏng thì đánh dấu FAILED chứ không bỏ lại PENDING', async () => {
    const { service, updates } = fakes(null, true);

    await expect(service.enqueue('user-1', 'job-1', false)).rejects.toThrow(
      'hàng đợi chết',
    );
    expect(updates).toEqual([
      { status: 'FAILED', error: 'Không xếp được vào hàng đợi' },
    ]);
  });

  it('tin không tồn tại thì không xếp hàng và không ghi gì', async () => {
    const { service, upserts, send } = fakes(null);
    (
      service as unknown as {
        prisma: { job: { findUnique: jest.Mock } };
      }
    ).prisma.job.findUnique.mockResolvedValueOnce(null);

    await expect(service.enqueue('user-1', 'khong-co', false)).rejects.toThrow(
      'Không tìm thấy công việc',
    );
    expect(upserts).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
