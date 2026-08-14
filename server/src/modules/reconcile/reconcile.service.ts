import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STALE_RUNNING_MS } from '../matching/matching.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';

/// Sau bao lâu thì một việc nền được coi là đã bị rơi.
///
/// PHẢI lớn hơn hoặc bằng ngưỡng thoát của `MatchingService`. Nếu nhỏ hơn,
/// reconcile sẽ xếp lại một lượt chấm mà chính `claim()` ở đó vẫn coi là "đang
/// chạy" và từ chối - tốn một message để không làm gì cả, và tệ hơn là log sẽ
/// báo đã xếp lại trong khi thực tế không có gì chạy.
export const STUCK_AFTER_MS = Math.max(STALE_RUNNING_MS, 10 * 60_000);

/// Trần số việc xếp lại trong MỘT lượt, tính riêng cho từng loại.
///
/// Không có trần thì một sự cố dài - worker chết cả đêm - sẽ dồn hàng nghìn lượt
/// gọi model vào cùng một lúc ngay khi hệ thống vừa hồi phục, đúng lúc nó yếu
/// nhất. Phần còn lại để lượt reconcile sau nhặt tiếp; số bị bỏ lại được báo ra
/// chứ không im lặng.
const MAX_PER_KIND = 100;

export type ReconcileResult = {
  /// Số tài liệu đã xếp lại.
  documents: number;
  /// Số lượt chấm điểm đã xếp lại.
  matches: number;
  /// Số việc vượt trần, để lại cho lượt sau.
  deferred: number;
};

/// Nhặt lại những việc nền đã rơi mất.
///
/// VÌ SAO CẦN: `applications.create` ghi bản ghi Document rồi mới gửi message vào
/// hàng đợi. Hai bước đó không nằm trong cùng một transaction và KHÔNG THỂ nằm
/// cùng - pg-boss ghi bằng connection pool riêng (xem `queue.service.ts`), ngoài
/// tầm mọi transaction của Prisma. Nên luôn có một khe: bản ghi tồn tại ở trạng
/// thái `PENDING` mà không message nào đi kèm, và người dùng nhìn thấy "đang
/// sinh..." vĩnh viễn.
///
/// Đây là lời giải rẻ hơn transactional outbox và dùng lại được cho mọi loại việc
/// nền: chính trạng thái trong database là hàng chờ, còn hàng đợi chỉ là đường
/// nhanh. Việc xếp lại tự nhiên idempotent vì hàng đợi chặn trùng theo khoá, và
/// vì bước sinh ghi đè kết quả cũ.
///
/// CỐ Ý không xếp lại việc ở trạng thái `FAILED`. `FAILED` là trạng thái cuối mà
/// người dùng bấm lại được, và tự động thử lại khi chưa có bộ đếm số lần thử sẽ
/// biến một dữ liệu vào hỏng vĩnh viễn thành một vòng lặp tốn tiền.
@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async run(): Promise<ReconcileResult> {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);

    // Lấy thêm một bản ghi so với trần để biết có bị cắt hay không, mà không cần
    // một câu count riêng.
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

    // Việc cũ nhất được ưu tiên: người chờ lâu nhất phải được phục vụ trước.
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

    // `warn` chứ không phải `log`: có việc bị rơi nghĩa là trước đó đã có gì đó
    // hỏng, và đó là thông tin người vận hành cần thấy. Lượt nào không tìm thấy
    // gì thì im lặng - cron chạy 10 phút một lần, log mỗi lượt sẽ thành tiếng ồn
    // che mất đúng những dòng đáng đọc.
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
