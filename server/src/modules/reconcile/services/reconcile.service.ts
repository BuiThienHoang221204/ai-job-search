import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { STALE_RUNNING_MS } from '../../matching/services/matching.service.js';
import { QUEUE, QueueService } from '../../queue/queue.service.js';

/** Sau bao lâu thì một việc nền được coi là đã bị rơi. */
export const STUCK_AFTER_MS = Math.max(STALE_RUNNING_MS, 10 * 60_000);

/** Trần số việc xếp lại trong MỘT lượt, tính riêng cho từng loại. */
const MAX_PER_KIND = 100;

export type ReconcileResult = {
  /** Số tài liệu đã xếp lại. */
  documents: number;
  /** Số lượt chấm điểm đã xếp lại. */
  matches: number;
  /** Số lượt chạy agent bị bỏ rơi, đã đánh dấu thất bại. */
  agentRuns: number;
  /** Số việc vượt trần, để lại cho lượt sau. */
  deferred: number;
};

/** Nhặt lại những việc nền đã rơi mất. */
@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async run(): Promise<ReconcileResult> {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);

    const [documents, matches] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          status: { in: ['PENDING', 'RUNNING'] },
          updatedAt: { lt: stuckBefore },
        },
        select: { id: true, userId: true },
        orderBy: { updatedAt: 'asc' },
        take: MAX_PER_KIND + 1,
      }),
      this.prisma.jobMatch.findMany({
        where: {
          status: { in: ['PENDING', 'RUNNING'] },
          updatedAt: { lt: stuckBefore },
        },
        select: { userId: true, jobId: true },
        orderBy: { updatedAt: 'asc' },
        take: MAX_PER_KIND + 1,
      }),
    ]);

    const documentBatch = documents.slice(0, MAX_PER_KIND);
    const matchBatch = matches.slice(0, MAX_PER_KIND);

    const [documentsQueued, matchesQueued] = await Promise.all([
      this.queue.sendMany(
        QUEUE.GENERATE_DOCUMENT,
        documentBatch.map((row) => ({
          userId: row.userId,
          documentId: row.id,
        })),
      ),
      this.queue.sendMany(
        QUEUE.EVALUATE_MATCH,
        matchBatch.map((row) => ({ userId: row.userId, jobId: row.jobId })),
      ),
    ]);

    const agentRuns = await this.failStuckAgentRuns(stuckBefore);

    const result: ReconcileResult = {
      documents: documentsQueued,
      matches: matchesQueued,
      agentRuns,
      deferred:
        documents.length -
        documentBatch.length +
        (matches.length - matchBatch.length),
    };

    if (documentsQueued || matchesQueued || agentRuns || result.deferred) {
      this.logger.warn(
        `Xếp lại việc bị rơi: ${documentsQueued} tài liệu, ${matchesQueued} lượt chấm, ${agentRuns} lượt agent` +
          (result.deferred
            ? `; còn ${result.deferred} việc vượt trần, để lượt sau`
            : ''),
      );
    }

    return result;
  }

  /**
   * Lượt chạy agent bị bỏ rơi thì đánh dấu THẤT BẠI, KHÔNG tự xếp lại.
   *
   * Khác hẳn tài liệu và chấm điểm ở trên, và khác vì tiền: một lượt agent tiêu
   * 10-20 lời gọi model, nên tự chạy lại một lượt đã đi được nửa đường có thể
   * đốt hạn mức của cả hệ thống mà không ai yêu cầu. Người dùng bấm "Chạy tiếp"
   * thì nó đi tiếp từ điểm khôi phục - rẻ hơn và do người quyết.
   *
   * Vì sao cần quét: bản ghi chỉ chuyển sang FAILED từ trong khối `catch` của
   * chính worker. Tiến trình chết giữa chừng - deploy, restart, hết hạn pg-boss
   * - thì không `catch` nào chạy, và lượt chạy nằm RUNNING vĩnh viễn. Đã gặp
   * thật: một lượt đứng im 17 phút trong khi hàng đợi không còn việc nào.
   */
  private async failStuckAgentRuns(stuckBefore: Date): Promise<number> {
    const { count } = await this.prisma.agentRun.updateMany({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        updatedAt: { lt: stuckBefore },
      },
      data: {
        status: 'FAILED',
        error:
          'Tiến trình xử lý bị gián đoạn giữa chừng. Bấm "Chạy tiếp từ chỗ dừng" để đi tiếp từ bước cuối cùng đã xong.',
        finishedAt: new Date(),
      },
    });

    return count;
  }
}
