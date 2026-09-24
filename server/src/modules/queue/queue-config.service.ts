import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { QueueConfig } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { concurrencyForQueue, allQueueConfigs } from './queue.defaults.js';
import type { QueueConfigItem } from './queue.types.js';

const toItem = (row: QueueConfig): QueueConfigItem => ({
  queueName: row.queueName,
  concurrency: row.concurrency,
  serial: row.serial,
  note: row.note,
});

/** Concurrency SỐNG, đọc từ database để admin đổi được lúc đang chạy. Bảng mặc định ở `queue.defaults.ts`. */
@Injectable()
export class QueueConfigService implements OnModuleInit {
  private readonly logger = new Logger(QueueConfigService.name);

  /** Cache in-memory: worker đọc từ đây, không hỏi database mỗi lần poll. */
  private cache = new Map<string, QueueConfigItem>();

  constructor(private readonly prisma: PrismaService) {}

  /** MỘT `createMany` thay vì kiểm-rồi-tạo từng dòng — 11 hàng đợi từng tốn tới 22 truy vấn mỗi lần app khởi động. */
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

  /** Đọc từ database và dựng lại cache. */
  async refreshCache(): Promise<void> {
    const rows = await this.prisma.queueConfig.findMany();
    this.cache = new Map(rows.map((row) => [row.queueName, toItem(row)]));
  }

  /** Worker hỏi hàm này để lấy concurrency hiện tại; chưa có dòng trong database thì lùi về bảng mặc định. */
  getConcurrency(queue: string): number {
    const config = this.cache.get(queue);
    if (config?.serial) return 1;
    if (config) return Math.max(1, config.concurrency);
    return concurrencyForQueue(queue);
  }

  /** Danh sách cho màn hình admin. */
  async findAll(): Promise<QueueConfigItem[]> {
    await this.refreshCache();
    return [...this.cache.values()];
  }

  /** Admin đổi concurrency cho một hàng đợi. Worker nhận giá trị mới ở nhịp refresh kế tiếp, chậm nhất 30 giây. */
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
