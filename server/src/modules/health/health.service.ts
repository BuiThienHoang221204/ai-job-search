import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  LATEX_COMPILER,
  type LatexCompiler,
} from '../documents/latex-compile.js';
import { QueueService } from '../queue/queue.service.js';

/// Hạn cho từng phép kiểm tra.
///
/// Một kết nối database bị treo sẽ không bao giờ trả lời, và probe treo thì với
/// orchestrator không khác gì probe hỏng - chỉ tệ hơn ở chỗ nó chiếm chỗ chờ tới
/// khi hết timeout của bên gọi. Thà trả "không sẵn sàng" nhanh và dứt khoát.
const CHECK_TIMEOUT_MS = 2_000;

export type CheckResult = { ok: boolean; error?: string };

export type ReadinessReport = {
  ready: boolean;
  checks: {
    database: CheckResult;
    queue: CheckResult;
    /**
     * Môi trường tạo PDF.
     *
     * KHÔNG tính vào `ready`, và đó là quyết định có chủ đích: mất PDF thì người
     * dùng vẫn chấm điểm, xem việc làm, soạn CV và ứng tuyển được — cho
     * orchestrator khởi động lại cả app vì một tính năng phụ là biến một sự cố nhỏ
     * thành một lần chết toàn phần.
     *
     * Nhưng nó phải HIỆN RA. Trước đây `/ready` chỉ kiểm database và hàng đợi, nên
     * một máy chủ không tạo được PDF vẫn báo "ready" và không ai biết cho tới khi
     * người dùng đầu tiên bấm nút.
     */
    latex: CheckResult;
  };
};

const withTimeout = async (
  work: Promise<unknown>,
  label: string,
): Promise<CheckResult> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`${label} không trả lời trong ${CHECK_TIMEOUT_MS}ms`),
            ),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // Không dọn thì tiến trình bị giữ sống thêm tới 2 giây sau mỗi probe.
    if (timer) clearTimeout(timer);
  }
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(LATEX_COMPILER) private readonly latex: LatexCompiler,
  ) {}

  /// Các phụ thuộc đã sẵn sàng nhận việc hay chưa.
  ///
  /// LUÔN trả về kết quả của cả hai phép kiểm, kể cả khi cái đầu đã hỏng: người
  /// vận hành cần biết hỏng những gì, không chỉ biết "có hỏng". Dừng ở phép kiểm
  /// đầu tiên thất bại sẽ che mất một sự cố thứ hai đang xảy ra cùng lúc.
  async readiness(): Promise<ReadinessReport> {
    const database = await withTimeout(
      this.prisma.$queryRawUnsafe('SELECT 1'),
      'database',
    );

    // Hàng đợi trả lời đồng bộ nên không cần hạn thời gian ở đây.
    //
    // Phép kiểm này chỉ nói về TRẠNG THÁI KHỞI TẠO, không phải kết nối hiện tại -
    // và như vậy là đủ: pg-boss dùng chung chính Postgres ở trên, nên mất kết nối
    // đã được phép kiểm `database` bắt. Thêm một lần ping riêng chỉ tốn thêm một
    // round-trip mà không cho biết điều gì mới.
    const status = this.queue.status();
    const queue: CheckResult = status.ready
      ? { ok: true }
      : { ok: false, error: status.error ?? 'hàng đợi chưa khởi tạo xong' };

    // `available()` của cả hai adapter đều tự bắt lỗi và trả false, nhưng vẫn bọc
    // timeout: một daemon Docker treo sẽ không trả lời, và probe treo thì với
    // orchestrator không khác gì probe hỏng.
    const latex = await withTimeout(
      this.latex.available().then((ok) => {
        if (!ok) throw new Error('môi trường tạo PDF không phản hồi');
      }),
      'latex',
    );

    return {
      // `latex` cố ý KHÔNG nằm trong phép AND — xem ghi chú ở `ReadinessReport`.
      ready: database.ok && queue.ok,
      checks: { database, queue, latex },
    };
  }
}
