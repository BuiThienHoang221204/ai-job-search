import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateJobDto, ListJobsQueryDto } from './dto/job.dto.js';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Tạo hoặc cập nhật tin tuyển dụng.
  ///
  /// Chống trùng theo (source, externalId) để scrape lại nhiều lần không sinh
  /// bản ghi mới. Tin dán tay không có externalId thì luôn tạo mới.
  async upsert(dto: CreateJobDto) {
    const data = {
      title: dto.title,
      company: dto.company,
      description: dto.description,
      url: dto.url ?? '',
      source: dto.source ?? 'manual',
      externalId: dto.externalId ?? null,
      companyLogo: dto.companyLogo ?? null,
      location: dto.location ?? null,
      workMode: dto.workMode ?? null,
      salaryRaw: dto.salaryRaw ?? null,
      salaryMin: dto.salaryMin ?? null,
      salaryMax: dto.salaryMax ?? null,
      currency: dto.currency ?? null,
      tags: dto.tags ?? [],
    };

    if (!data.externalId) return this.prisma.job.create({ data });

    return this.prisma.job.upsert({
      where: {
        source_externalId: { source: data.source, externalId: data.externalId },
      },
      create: data,
      update: data,
    });
  }

  /// Quan hệ `saves` đã được lọc sẵn theo userId, nên chỉ cần biết mảng có
  /// rỗng hay không. Tách ra thành hàm riêng để logic này chỉ tồn tại ở một
  /// chỗ.
  private withSavedFlag<T extends { saves: unknown[] }>(job: T) {
    const { saves, ...rest } = job;
    return { ...rest, saved: saves.length > 0 };
  }

  async list(query: ListJobsQueryDto, userId: string) {
    const where = query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' as const } },
            { company: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { scrapedAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
        // Quan hệ có điều kiện: một truy vấn duy nhất, không N+1 và không bắt
        // giao diện gọi thêm một lượt chỉ để biết tin nào đã lưu.
        include: { saves: { where: { userId }, select: { id: true } } },
      }),
      this.prisma.job.count({ where }),
    ]);

    return { items: items.map((job) => this.withSavedFlag(job)), total };
  }

  async get(id: string, userId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { saves: { where: { userId }, select: { id: true } } },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${id}`);
    return this.withSavedFlag(job);
  }

  /// Lưu tin. Bấm nút hai lần không được sinh lỗi - dùng upsert thay vì
  /// create.
  async save(userId: string, jobId: string) {
    await this.get(jobId, userId);
    await this.prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId },
      update: {},
    });
    return { saved: true };
  }

  /// Bỏ lưu. Bỏ một tin chưa từng lưu cũng trả về bình thường: nút bấm là một
  /// công tắc, không phải một giao dịch.
  async unsave(userId: string, jobId: string) {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: false };
  }

  async listSaved(userId: string) {
    const saves = await this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
      include: { job: true },
    });
    return {
      items: saves.map((save) => ({
        ...save.job,
        saved: true,
        savedAt: save.savedAt,
      })),
      total: saves.length,
    };
  }
}
