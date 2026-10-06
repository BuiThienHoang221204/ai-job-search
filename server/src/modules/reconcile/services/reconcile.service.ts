import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { STUCK_AFTER_MS } from '@/common/duration';
import { QUEUE, QueueService } from '@/modules/queue/queue.service';

const MAX_PER_KIND = 100;

const STUCK_MESSAGE =
  'Máy chủ khởi động lại khi việc này đang chạy dở, nên nó không bao giờ hoàn tất. Hãy bấm chạy lại.';

export type ReconcileResult = {
  documents: number;
  matches: number;
  agentRuns: number;
  upskillReports: number;
  interviewPreps: number;
  profileDrafts: number;
  jobRequirements: number;
  deferred: number;
};

const stuckWhere = (before: Date) => ({
  status: { in: ['PENDING' as const, 'RUNNING' as const] },
  updatedAt: { lt: before },
});

@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /** `Document`/`JobMatch` được xếp lại vì rẻ và có khoá dedup; các bảng còn lại chỉ đánh hỏng. */
  async run(): Promise<ReconcileResult> {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);

    const [documents, matches] = await Promise.all([
      this.prisma.document.findMany({
        where: stuckWhere(stuckBefore),
        select: { id: true, userId: true },
        orderBy: { updatedAt: 'asc' },
        take: MAX_PER_KIND + 1,
      }),
      this.prisma.jobMatch.findMany({
        where: stuckWhere(stuckBefore),
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

    const failed = await this.failStuck(stuckBefore);

    const result: ReconcileResult = {
      documents: documentsQueued,
      matches: matchesQueued,
      ...failed,
      deferred:
        documents.length -
        documentBatch.length +
        (matches.length - matchBatch.length),
    };

    this.report(result);
    return result;
  }

  private async failStuck(stuckBefore: Date) {
    const where = stuckWhere(stuckBefore);
    const data = { status: 'FAILED' as const, error: STUCK_MESSAGE };

    const [
      agentRuns,
      upskillReports,
      interviewPreps,
      profileDrafts,
      jobRequirements,
    ] = await Promise.all([
      this.prisma.agentRun.updateMany({
        where,
        data: { ...data, finishedAt: new Date() },
      }),
      this.prisma.upskillReport.updateMany({
        where: {
          status: where.status,
          createdAt: { lt: stuckBefore },
        },
        data,
      }),
      this.prisma.interviewPrep.updateMany({ where, data }),
      this.prisma.profileDraft.updateMany({ where, data }),
      this.prisma.jobRequirement.updateMany({ where, data }),
    ]);

    return {
      agentRuns: agentRuns.count,
      upskillReports: upskillReports.count,
      interviewPreps: interviewPreps.count,
      profileDrafts: profileDrafts.count,
      jobRequirements: jobRequirements.count,
    };
  }

  private report(result: ReconcileResult): void {
    const total = Object.values(result).reduce((sum, n) => sum + n, 0);
    if (!total) return;

    const failed = [
      ['lượt agent', result.agentRuns],
      ['báo cáo upskill', result.upskillReports],
      ['bộ câu hỏi phỏng vấn', result.interviewPreps],
      ['bản đọc CV', result.profileDrafts],
      ['bản rút yêu cầu', result.jobRequirements],
    ]
      .filter(([, count]) => count)
      .map(([label, count]) => `${count} ${label}`)
      .join(', ');

    this.logger.warn(
      `Xếp lại ${result.documents} tài liệu, ${result.matches} lượt chấm` +
        (failed ? `; đánh hỏng ${failed}` : '') +
        (result.deferred
          ? `; còn ${result.deferred} việc vượt trần, để lượt sau`
          : ''),
    );
  }
}
