import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { concurrencyForQueue, allQueueConfigs } from './queue.config.js';

export type QueueConfigItem = {
  queueName: string;
  concurrency: number;
  serial: boolean;
  note: string | null;
};

@Injectable()
export class QueueConfigService implements OnModuleInit {
  private readonly logger = new Logger(QueueConfigService.name);

  /** Cache in-memory: worker đọc từ đây, không hit DB mỗi lần poll. */
  private cache = new Map<string, QueueConfigItem>();

  constructor(private readonly prisma: PrismaService) {}

  /** Seed data mặc định khi chưa có config trong DB. */
  async onModuleInit(): Promise<void> {
    const defaults = allQueueConfigs();

    for (const [name, config] of Object.entries(defaults)) {
      const exists = await this.prisma.queueConfig.findUnique({
        where: { queueName: name },
      });

      if (!exists) {
        await this.prisma.queueConfig.create({
          data: {
            queueName: name,
            concurrency: config.concurrency,
            serial: config.serial ?? false,
            note: config.serial ? 'Bắt buộc tuần tự để tránh chặn IP' : null,
          },
        });
        this.logger.log(`Seeded queue config: ${name} = ${config.concurrency}`);
      }
    }

    await this.refreshCache();
    this.logger.log('Queue config cache loaded');
  }

  /** Đọc từ DB và refresh cache. */
  async refreshCache(): Promise<void> {
    const rows = await this.prisma.queueConfig.findMany();
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.queueName, {
        queueName: row.queueName,
        concurrency: row.concurrency,
        serial: row.serial,
        note: row.note,
      });
    }
  }

  /** Worker gọi hàm này mỗi 30s để lấy concurrency hiện tại. */
  getConcurrency(queue: string): number {
    const config = this.cache.get(queue);
    if (config?.serial) return 1;
    if (config) return Math.max(1, config.concurrency);
    // Fallback về config cứng nếu chưa có trong DB
    return concurrencyForQueue(queue);
  }

  /** Lấy tất cả configs (cho admin UI). */
  async findAll(): Promise<QueueConfigItem[]> {
    await this.refreshCache();
    return Array.from(this.cache.values());
  }

  /** Admin cập nhật concurrency cho 1 queue. */
  async update(
    queueName: string,
    put: { concurrency?: number; serial?: boolean; note?: string },
  ): Promise<QueueConfigItem> {
    const data: {
      queueName: string;
      concurrency: number;
      serial: boolean;
      note: string | null;
    } = {
      queueName,
      concurrency: put.concurrency ?? 1,
      serial: put.serial ?? false,
      note: put.note ?? null,
    };

    const row = await this.prisma.queueConfig.upsert({
      where: { queueName },
      create: data,
      update: {
        concurrency: data.concurrency,
        serial: data.serial,
        note: data.note,
      },
    });

    await this.refreshCache();

    this.logger.log(
      `Queue "${queueName}" updated: concurrency=${row.concurrency}, serial=${row.serial}`,
    );

    return {
      queueName: row.queueName,
      concurrency: row.concurrency,
      serial: row.serial,
      note: row.note,
    };
  }
}
