import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import { appRole, runsBackgroundWork } from '../../config/app-role.js';
import { QUEUE, QUEUE_POLICY } from './queue.constants.js';
import { singletonKeyFor } from './queue-key.js';
import { QueueConfigService } from './queue-config.service.js';
import type { QueueStats, QueueStatsItem, QueueStatus } from './queue.types.js';

/** Một đường import cho 37 file gọi tới: chúng không cần biết module chia file thế nào bên trong. */
export { QUEUE, QUEUE_POLICY } from './queue.constants.js';
export type * from './queue.types.js';

/** Hàng đợi chạy trên chính Postgres, không cần Redis. */
@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private boss!: PgBoss;
  private started!: Promise<void>;

  /** Đọc lại concurrency từ database mỗi 30 giây — admin đổi số là worker nhận trong vòng một nhịp. */
  private refreshTimer?: NodeJS.Timeout;

  /** Ghi lại kết quả khởi tạo để readiness probe đọc được. */
  private isStarted = false;
  private startupError: string | null = null;

  constructor(private readonly queueConfig: QueueConfigService) {}

  /** Khởi tạo KHÔNG await ở đây: mọi hàm công khai await `this.started`, nhờ vậy caller gọi sớm vẫn đúng thứ tự. */
  onModuleInit(): void {
    this.started = (async () => {
      try {
        const { PgBoss: PgBossClass } = await import('pg-boss');

        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error('DATABASE_URL chưa được đặt');

        this.boss = new PgBossClass({
          connectionString,
          schema: 'pgboss',
          max: 10,
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
        this.logger.log(
          `Vai tiến trình: ${appRole()}` +
            (runsBackgroundWork() ? '' : ' - KHÔNG đăng ký worker nào'),
        );

        this.refreshTimer = setInterval(() => {
          this.queueConfig.refreshCache().catch((error: unknown) => {
            this.logger.error('Lỗi refresh queue config', error);
          });
        }, 30_000);
      } catch (error) {
        this.startupError =
          error instanceof Error ? error.message : String(error);
        throw error;
      }
    })();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.boss?.stop({ graceful: true });
  }

  /** Trạng thái khởi tạo, cho readiness probe. */
  status(): QueueStatus {
    return { ready: this.isStarted, error: this.startupError };
  }

  /** Thống kê realtime mọi hàng đợi, hỏi song song vì 11 lần `getQueue` tuần tự là 11 vòng đi-về database. */
  async getStats(): Promise<QueueStats> {
    await this.started;

    const queues: QueueStatsItem[] = await Promise.all(
      Object.values(QUEUE).map(async (name) => {
        const row = await this.boss.getQueue(name);
        return {
          name,
          concurrency: this.queueConfig.getConcurrency(name),
          size: (row?.queuedCount as number) ?? 0,
          active: (row?.activeCount as number) ?? 0,
          total: (row?.totalCount as number) ?? 0,
        };
      }),
    );

    return {
      queues,
      totalWaiting: queues.reduce((sum, q) => sum + q.size, 0),
      totalActive: queues.reduce((sum, q) => sum + q.active, 0),
    };
  }

  /** Tạo hàng đợi, và nâng cấp policy nếu hàng đợi đã tồn tại với policy khác. */
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
          'Bước này cần người xác nhận: chạy lại với QUEUE_POLICY_MIGRATE=true.',
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

  /** Xếp một việc. Khoá dedup SUY RA từ payload, người gọi không truyền vào được. */
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

  /** Xếp NHIỀU việc bằng một lệnh. `returnId` là bắt buộc, thiếu nó thì `insert` luôn trả `null` và log báo 0. */
  async sendMany<T extends object>(queue: string, items: T[]): Promise<number> {
    await this.started;
    if (!items.length) return 0;

    const ids = await this.boss.insert(
      queue,
      items.map((data) => ({
        data,
        singletonKey: singletonKeyFor(queue, data),
      })),
      { returnId: true },
    );
    return ids?.length ?? 0;
  }

  /** Đăng ký worker. Vai `api` thoát ở đây thay vì để từng processor tự kiểm — đây là seam duy nhất cả 7 processor đi qua. */
  async work<T extends object>(
    queue: string,
    handler: (data: T) => Promise<void>,
    options: WorkOptions = {},
  ): Promise<void> {
    if (!runsBackgroundWork()) {
      this.logger.debug(`Vai ${appRole()}: bỏ qua worker cho ${queue}`);
      return;
    }

    await this.started;
    const concurrency = this.queueConfig.getConcurrency(queue);
    await this.boss.work<T>(
      queue,
      {
        // `batchSize` giữ 1 và song song lấy từ `localConcurrency`: pg-boss áp kết quả handler cho CẢ lô, gom lô là một việc hỏng kéo đổ việc lành.
        batchSize: 1,
        pollingIntervalSeconds: 2,
        localConcurrency: concurrency,
        ...options,
      },
      async (jobs) => {
        for (const job of jobs) await handler(job.data);
      },
    );
    this.logger.log(
      `Worker đang lắng nghe: ${queue} (song song ${concurrency})`,
    );
  }
}
