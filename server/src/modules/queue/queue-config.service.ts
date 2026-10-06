import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { QueueConfig } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { concurrencyForQueue, allQueueConfigs } from './queue.defaults';
import type { QueueConfigItem } from './queue.types';

const toItem = (row: QueueConfig): QueueConfigItem => ({
  queueName: row.queueName,
  concurrency: row.concurrency,
  serial: row.serial,
  note: row.note,
});

@Injectable()
export class QueueConfigService implements OnModuleInit {
  private readonly logger = new Logger(QueueConfigService.name);

  private cache = new Map<string, QueueConfigItem>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const seeded = await this.prisma.queueConfig.createMany({
      data: Object.entries(allQueueConfigs()).map(([queueName, config]) => ({
        queueName,
        concurrency: config.concurrency,
        serial: config.serial ?? false,
        note: config.serial ? 'Bắt buộc tuần tự để tránh chặn IP' : null,
      })),
      skipDuplicates: true,
    });

    await this.refreshCache();
    this.logger.log(
      `Queue config: ${this.cache.size} hàng đợi trong cache (${seeded.count} dòng vừa seed)`,
    );
  }

  async refreshCache(): Promise<void> {
    const rows = await this.prisma.queueConfig.findMany();
    this.cache = new Map(rows.map((row) => [row.queueName, toItem(row)]));
  }

  getConcurrency(queue: string): number {
    const config = this.cache.get(queue);
    if (config?.serial) return 1;
    if (config) return Math.max(1, config.concurrency);
    return concurrencyForQueue(queue);
  }

  async findAll(): Promise<QueueConfigItem[]> {
    await this.refreshCache();
    return [...this.cache.values()];
  }

  async update(
    queueName: string,
    put: { concurrency?: number; serial?: boolean; note?: string },
  ): Promise<QueueConfigItem> {
    const data = {
      concurrency: put.concurrency ?? 1,
      serial: put.serial ?? false,
      note: put.note ?? null,
    };

    const row = await this.prisma.queueConfig.upsert({
      where: { queueName },
      create: { queueName, ...data },
      update: data,
    });
    await this.refreshCache();

    this.logger.log(
      `Hàng đợi "${queueName}": concurrency=${row.concurrency}, serial=${row.serial}`,
    );
    return toItem(row);
  }
}
