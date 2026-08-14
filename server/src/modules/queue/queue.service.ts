import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import { singletonKeyFor } from './queue-key.js';

/// Policy áp cho mọi hàng đợi.
///
/// `exclusive` = chỉ MỘT job ở trạng thái queued hoặc active trên mỗi
/// `singletonKey`. Đây mới là thứ chặn trùng; `singletonKey` một mình KHÔNG làm
/// gì cả trên policy mặc định `standard` - ở đó nó chỉ phục vụ throttle và
/// update/upsert. Thêm khoá mà không đổi policy sẽ tạo ra một thay đổi trông như
/// có tác dụng nhưng thực tế không, nên hai thứ phải đi cùng nhau.
///
/// KHÔNG chọn `key_strict_fifo`: nó chặn cả khi job trước đã `failed`, làm hỏng
/// đường xếp lại việc của bước reconcile.
const QUEUE_POLICY = 'exclusive';

export const QUEUE = {
  /// Chấm điểm một cặp (user, job). Đây là đường GHI của màn hình dashboard.
  EVALUATE_MATCH: 'match.evaluate',
  /// Soạn bộ câu hỏi phỏng vấn cho một công việc.
  INTERVIEW_PREP: 'interview.prep',
  /// Tổng hợp thiếu hụt kỹ năng trên toàn bộ công việc đã chấm.
  UPSKILL_REPORT: 'upskill.report',
  /// Sinh CV / thư xin việc / câu trả lời form.
  GENERATE_DOCUMENT: 'document.generate',
  /// Quét tin tuyển dụng từ portal rồi đẩy từng tin sang match.evaluate.
  SCRAPE_RUN: 'scrape.run',
  /// Đọc CV/nguồn ngoài thành một ĐỀ XUẤT hồ sơ, chờ người dùng xác nhận.
  PROFILE_SYNTHESIZE: 'profile.synthesize',
} as const;

export type EvaluateMatchPayload = {
  userId: string;
  jobId: string;
  force?: boolean;
};

export type InterviewPrepPayload = {
  userId: string;
  jobId: string;
  force?: boolean;
};

export type UpskillReportPayload = {
  userId: string;
  reportId: string;
};

export type GenerateDocumentPayload = {
  userId: string;
  documentId: string;
};

export type ProfileSynthesizePayload = {
  userId: string;
  draftId: string;
};

export type ScrapeRunPayload = {
  runId: string;
  /// Vắng mặt khi đây là lần quét của hệ thống do cron chạy. Worker chỉ cần
  /// runId; chủ sở hữu đã nằm trong chính bản ghi ScrapeRun.
  userId?: string;
};

/// Mặt tiếp xúc mà các module khác dùng để đẩy và nhận việc nền.
///
/// Suy ra từ `QueueService` bằng `Pick` chứ không khai lại, cùng lý do như
/// `Ai` trong `ai.service.ts`: bản giả trong test phải hỏng build khi chữ ký
/// đổi, thay vì âm thầm khớp một hình dạng đã cũ. Vòng đời (`onModuleInit`,
/// `onApplicationShutdown`) cố ý không nằm trong mặt tiếp xúc - đó là việc của
/// Nest với bản thật, bản giả không cần mở kết nối nào.
export type Queue = Pick<QueueService, 'send' | 'sendMany' | 'work' | 'status'>;

/// Trạng thái khởi tạo hàng đợi, dùng cho readiness probe.
export type QueueStatus = { ready: boolean; error: string | null };

/// Hàng đợi chạy trên chính Postgres, không cần Redis.
///
/// pg-boss v12 là package ESM thuần còn Nest build ra CommonJS, nên phải nạp
/// bằng import() động. Import tĩnh sẽ hỏng lúc chạy dù tsc không báo lỗi.
///
/// Dùng connection string riêng chứ KHÔNG dùng adapter fromPrisma: pg-boss dựa
/// vào to_regclass() để dò xem schema đã cài chưa, mà kiểu `regclass` thì
/// driver adapter của Prisma 7 không map được (UnsupportedNativeDataType). Cái
/// giá phải trả là thêm một pool nhỏ, đổi lấy việc không phụ thuộc vào vùng
/// giao nhau giữa hai thư viện.
@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private boss!: PgBoss;
  private started!: Promise<void>;

  /// Ghi lại kết quả khởi tạo để readiness probe đọc được.
  ///
  /// Phạm vi thật của nó, đã kiểm bằng cách chạy container thật: nếu bước khởi
  /// tạo thất bại thì các processor `await this.started` ngay trong
  /// `onModuleInit` của chúng, nên **Nest không khởi động được** và tiến trình
  /// thoát với mã 1 kèm thông báo. Đó là hành vi đúng - phục vụ request trong khi
  /// toàn bộ việc nền đã chết thì tệ hơn là không phục vụ.
  ///
  /// Vậy hai biến này còn để làm gì: chúng phủ khoảng thời gian app đã nhận
  /// request nhưng hàng đợi chưa khởi tạo xong, và giữ cho lỗi vẫn nhìn thấy được
  /// nếu về sau có processor nào thôi không await `started`. Chúng KHÔNG phát hiện
  /// được mất kết nối sau khi đã khởi động - việc đó do phép kiểm database của
  /// readiness lo, vì pg-boss dùng chung chính Postgres đó.
  private isStarted = false;
  private startupError: string | null = null;

  onModuleInit(): void {
    this.started = (async () => {
      try {
        const { PgBoss: PgBossClass } = await import('pg-boss');

        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error('DATABASE_URL chưa được đặt');

        this.boss = new PgBossClass({
          connectionString,
          schema: 'pgboss',
          max: 2,
        });
        this.boss.on('error', (error: Error) =>
          this.logger.error('pg-boss lỗi', error),
        );

        await this.boss.start();
        for (const name of Object.values(QUEUE)) {
          await this.ensureQueue(name);
        }

        this.isStarted = true;
        this.logger.log(
          `Hàng đợi sẵn sàng (policy ${QUEUE_POLICY}): ${Object.values(QUEUE).join(', ')}`,
        );
      } catch (error) {
        this.startupError =
          error instanceof Error ? error.message : String(error);
        // Ném lại: `send`/`work` await promise này nên chúng phải thấy lỗi thật,
        // không được im lặng chạy tiếp trên một hàng đợi chưa khởi tạo.
        throw error;
      }
    })();
  }

  /// Trạng thái khởi tạo, cho readiness probe.
  ///
  /// ĐỒNG BỘ và không bao giờ chờ. Nếu probe `await this.started` thì một lần
  /// khởi tạo bị treo sẽ làm probe treo theo, mà với orchestrator thì probe treo
  /// không khác gì probe hỏng - chỉ tệ hơn ở chỗ mất thêm thời gian chờ timeout.
  status(): QueueStatus {
    return { ready: this.isStarted, error: this.startupError };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true });
  }

  /// Tạo hàng đợi, và nâng cấp policy nếu hàng đợi đã tồn tại với policy khác.
  ///
  /// pg-boss KHÔNG cho đổi policy qua `updateQueue` - `UpdateQueueOptions` loại
  /// bỏ hẳn trường `policy` - nên cách duy nhất là xoá rồi tạo lại, và xoá hàng
  /// đợi là mất luôn việc đang chờ.
  ///
  /// Bản đầu của hàm này tự nâng cấp khi `queuedCount + activeCount === 0`. ĐÓ LÀ
  /// SAI: `queued_count` là một CỘT trên bảng queue do tác vụ bảo trì của pg-boss
  /// cập nhật định kỳ, không phải phép đếm trực tiếp. Ngay sau `send()` nó vẫn là
  /// 0, nên phép kiểm tra ấy sẽ xoá đúng những việc mà nó được viết ra để bảo vệ -
  /// tệ hơn là không kiểm tra gì, vì nó trông như an toàn. Một test tích hợp đã
  /// bắt được điều này.
  ///
  /// Nên việc xoá phải do người quyết định, không phải do một con số không đáng
  /// tin: mặc định là dừng khởi động và nói rõ phải làm gì.
  private async ensureQueue(name: string): Promise<void> {
    const existing = await this.boss.getQueue(name);

    if (!existing) {
      await this.boss.createQueue(name, { policy: QUEUE_POLICY });
      return;
    }
    if (existing.policy === QUEUE_POLICY) return;

    if (process.env.QUEUE_POLICY_MIGRATE !== 'true') {
      throw new Error(
        [
          `Hàng đợi "${name}" đang dùng policy "${existing.policy}", cần "${QUEUE_POLICY}" để chặn trùng việc.`,
          'pg-boss không cho đổi policy tại chỗ, nên phải xoá và tạo lại hàng đợi - việc đang chờ sẽ MẤT.',
          'Số việc chờ mà pg-boss báo là một cột được cập nhật định kỳ, không đáng tin để tự quyết định,',
          'nên bước này cần người xác nhận: chạy lại với QUEUE_POLICY_MIGRATE=true.',
        ].join('\n'),
      );
    }

    this.logger.warn(
      `Hàng đợi "${name}": QUEUE_POLICY_MIGRATE=true, xoá và tạo lại với policy ` +
        `${existing.policy} -> ${QUEUE_POLICY}. Việc đang chờ trong hàng đợi này bị bỏ.`,
    );
    await this.boss.deleteQueue(name);
    await this.boss.createQueue(name, { policy: QUEUE_POLICY });
  }

  /// Xếp một việc vào hàng đợi.
  ///
  /// Khoá dedup được suy ra từ payload chứ không nhận qua tham số - xem
  /// queue-key.ts về lý do.
  ///
  /// Trả `null` khi đã có một việc y hệt đang chờ hoặc đang chạy. Đó là kết quả
  /// ĐÚNG chứ không phải lỗi: thứ người gọi cần vẫn sẽ được làm, chỉ là không cần
  /// làm hai lần. Người gọi nào muốn phân biệt thì đọc giá trị trả về.
  async send<T extends object>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string | null> {
    await this.started;
    return this.boss.send(queue, data, {
      ...options,
      singletonKey: singletonKeyFor(queue, data),
    });
  }

  /// Xếp NHIỀU việc bằng một lệnh.
  ///
  /// Vòng lặp `send()` là N round-trip. Một lượt quét của hệ thống có trần 500
  /// cặp (user, job) nên đó là tới 500 lần INSERT tuần tự; số đo thật đã thấy 143
  /// lần trong một lượt. `insert()` của pg-boss nhận cả mảng và dùng
  /// `ON CONFLICT DO NOTHING`, nên khoá trùng bị bỏ qua chứ không huỷ cả lô.
  ///
  /// Trả về SỐ VIỆC THỰC SỰ ĐƯỢC XẾP, có thể nhỏ hơn `items.length` khi có trùng
  /// lặp - người gọi cần con số này để ghi log cho đúng.
  async sendMany<T extends object>(queue: string, items: T[]): Promise<number> {
    await this.started;
    if (!items.length) return 0;

    const ids = await this.boss.insert(
      queue,
      items.map((data) => ({
        data,
        singletonKey: singletonKeyFor(queue, data),
      })),
      // `returnId` BẮT BUỘC phải bật để đếm được. Không có nó, pg-boss bỏ hẳn
      // mệnh đề RETURNING và luôn trả `null` - việc vẫn vào hàng đợi bình
      // thường, nhưng mọi con số ghi ra log sẽ là 0 và người vận hành sẽ tưởng
      // fan-out không chạy.
      { returnId: true },
    );
    return ids?.length ?? 0;
  }

  /// Đăng ký worker. `batchSize` để 1 và poll thưa là có ý: gateway free của
  /// OpenCode không công bố hạn mức, bắn nhiều request song song là cách nhanh
  /// nhất để bị chặn.
  async work<T extends object>(
    queue: string,
    handler: (data: T) => Promise<void>,
    options: WorkOptions = {},
  ): Promise<void> {
    await this.started;
    await this.boss.work<T>(
      queue,
      { batchSize: 1, pollingIntervalSeconds: 2, ...options },
      async (jobs) => {
        for (const job of jobs) await handler(job.data);
      },
    );
    this.logger.log(`Worker đang lắng nghe: ${queue}`);
  }
}
