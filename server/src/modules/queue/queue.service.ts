import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import { appRole, runsBackgroundWork } from '@/config/app-role';
import { QUEUE, QUEUE_POLICY } from './queue.constants';
import { singletonKeyFor } from './queue-key';
import { QueueConfigService } from './queue-config.service';
import type { QueueStats, QueueStatsItem, QueueStatus } from './queue.types';
import { messageOf } from '@/common/error-message';

export { QUEUE, QUEUE_POLICY } from './queue.constants';
export type * from './queue.types';

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private boss!: PgBoss;
  private started!: Promise<void>;

  private refreshTimer?: NodeJS.Timeout;

  private isStarted = false;
  private startupError: string | null = null;

  constructor(private readonly queueConfig: QueueConfigService) {}

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
        this.startupError = messageOf(error);
        throw error;
      }
    })();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.boss?.stop({ graceful: true });
  }

  status(): QueueStatus {
    return { ready: this.isStarted, error: this.startupError };
  }

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

  /** Xếp nhiều việc một lệnh; thiếu `returnId` thì `insert` luôn trả `null`. */
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

  /** Đăng ký worker; vai `api` thoát ở đây nên mọi processor tự thừa hưởng. */
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
