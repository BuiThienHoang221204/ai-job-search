import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { PgBoss, SendOptions, WorkOptions } from 'pg-boss';

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

export type ScrapeRunPayload = {
  runId: string;
  /// Vắng mặt khi đây là lần quét của hệ thống do cron chạy. Worker chỉ cần
  /// runId; chủ sở hữu đã nằm trong chính bản ghi ScrapeRun.
  userId?: string;
};

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

  onModuleInit(): void {
    this.started = (async () => {
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
        await this.boss.createQueue(name);
      }
      this.logger.log(`Hàng đợi sẵn sàng: ${Object.values(QUEUE).join(', ')}`);
    })();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true });
  }

  async send<T extends object>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string | null> {
    await this.started;
    return this.boss.send(queue, data, options);
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
