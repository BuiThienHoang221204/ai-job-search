import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Job,
  JobRequirement,
} from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { AiService } from '../../../ai/services/ai.service.js';
import {
  jobRequirementsBatchSchema,
  jobRequirementsSchema,
  type JobRequirements,
  type JobRequirementsBatch,
} from '../schemas/job-requirements.schema.js';
import {
  batchPrompt,
  jobPrompt,
  BATCH_MAX_DESCRIPTION,
  BATCH_SYSTEM,
  SYSTEM,
} from '../prompt/job-requirements.prompt.js';
import { sourceHash } from '../utils/requirements.js';

@Injectable()
export class JobRequirementsService {
  private readonly logger = new Logger(JobRequirementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  private async markRunning(jobId: string): Promise<void> {
    await this.prisma.jobRequirement.upsert({
      where: { jobId },
      create: { jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });
  }

  private persist(
    jobId: string,
    hash: string,
    object: JobRequirements,
    modelId: string,
  ): Promise<JobRequirement> {
    return this.prisma.jobRequirement.update({
      where: { jobId },
      data: {
        status: 'DONE',
        requiredSkills: object.requiredSkills,
        niceToHaveSkills: object.niceToHaveSkills,
        minYears: object.minYears,
        seniority: object.seniority,
        citizenshipRequired: object.citizenshipRequired,
        workPermitRequired: object.workPermitRequired,
        eligibilityQuote: object.eligibilityQuote || null,
        city: object.city,
        remotePolicy: object.remotePolicy,
        sourceHash: hash,
        modelId,
        extractedAt: new Date(),
        error: null,
      },
    });
  }

  private markFailed(jobId: string, error: unknown): Promise<JobRequirement> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Rút trích yêu cầu thất bại (${jobId}): ${message}`);
    return this.prisma.jobRequirement.update({
      where: { jobId },
      data: { status: 'FAILED', error: message },
    });
  }

  /** Rút trích yêu cầu của một tin. Bỏ qua nếu nội dung chưa đổi. */
  async extract(jobId: string, force = false): Promise<JobRequirement> {
    const [job, existing] = await Promise.all([
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.jobRequirement.findUnique({ where: { jobId } }),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const hash = sourceHash(job);
    if (!force && existing?.status === 'DONE' && existing.sourceHash === hash) {
      return existing;
    }

    await this.markRunning(jobId);

    try {
      const { object, modelId } = await this.ai.generateObject<JobRequirements>(
        {
          schema: jobRequirementsSchema,
          context: { purpose: 'job.requirements' },
          system: SYSTEM,
          prompt: jobPrompt(job),
        },
      );

      return await this.persist(jobId, hash, object, modelId);
    } catch (error) {
      return this.markFailed(jobId, error);
    }
  }

  /** Một lượt gọi cho cả lô; tin quá dài, lô hỏng, hay lô thiếu phần tử đều lùi về đường lẻ — gộp lô không bao giờ tệ hơn không gộp. */
  async extractMany(
    jobIds: string[],
    force = false,
  ): Promise<JobRequirement[]> {
    if (jobIds.length <= 1) {
      return jobIds.length ? [await this.extract(jobIds[0], force)] : [];
    }

    const [jobs, existing] = await Promise.all([
      this.prisma.job.findMany({ where: { id: { in: jobIds } } }),
      this.prisma.jobRequirement.findMany({
        where: { jobId: { in: jobIds } },
      }),
    ]);
    const byJobId = new Map(existing.map((row) => [row.jobId, row]));

    const results: JobRequirement[] = [];
    const batch: Array<{ job: Job; hash: string }> = [];

    for (const job of jobs) {
      const hash = sourceHash(job);
      const previous = byJobId.get(job.id);
      if (
        !force &&
        previous?.status === 'DONE' &&
        previous.sourceHash === hash
      ) {
        results.push(previous);
        continue;
      }
      if (job.description.length > BATCH_MAX_DESCRIPTION) {
        results.push(await this.extract(job.id, force));
        continue;
      }
      batch.push({ job, hash });
    }

    if (!batch.length) return results;
    if (batch.length === 1) {
      results.push(await this.extract(batch[0].job.id, force));
      return results;
    }

    for (const entry of batch) await this.markRunning(entry.job.id);

    try {
      const { object, modelId } =
        await this.ai.generateObject<JobRequirementsBatch>({
          schema: jobRequirementsBatchSchema,
          context: { purpose: 'job.requirements' },
          system: BATCH_SYSTEM,
          prompt: batchPrompt(batch.map((entry) => entry.job)),
        });

      const byIndex = new Map(object.jobs.map((row) => [row.index, row]));

      for (const [offset, entry] of batch.entries()) {
        const extracted = byIndex.get(offset + 1);
        if (!extracted) {
          this.logger.warn(
            `Lô thiếu phần tử [${offset + 1}] cho ${entry.job.id}; rút lẻ`,
          );
          results.push(await this.extract(entry.job.id, force));
          continue;
        }
        results.push(
          await this.persist(entry.job.id, entry.hash, extracted, modelId),
        );
      }
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Lô ${batch.length} tin hỏng (${message}); rút lại từng tin một`,
      );
      for (const entry of batch) {
        results.push(await this.extract(entry.job.id, force));
      }
      return results;
    }
  }
}
