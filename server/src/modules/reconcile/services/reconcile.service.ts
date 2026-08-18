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

    const result: ReconcileResult = {
      documents: documentsQueued,
      matches: matchesQueued,
      deferred:
        documents.length -
        documentBatch.length +
        (matches.length - matchBatch.length),
    };

    if (documentsQueued || matchesQueued || result.deferred) {
      this.logger.warn(
        `Xếp lại việc bị rơi: ${documentsQueued} tài liệu, ${matchesQueued} lượt chấm` +
          (result.deferred
            ? `; còn ${result.deferred} việc vượt trần, để lượt sau`
            : ''),
      );
    }

    return result;
  }
}
