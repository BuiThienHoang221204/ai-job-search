import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { CompanyBrief as BriefRecord } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import type { CompanyBriefPayload } from '../../queue/queue.service.js';
import {
  BRIEF_SYSTEM,
  briefQueries,
  buildBriefPrompt,
  type NumberedSource,
} from '../utils/company-brief.prompt.js';
import {
  companyBriefSchema,
  CONFIDENCES,
  emptyBrief,
  resolveSources,
  VERDICTS,
  type BriefView,
  type CompanyBrief,
  type PreparedBrief,
} from '../utils/company-brief.js';
import { companyKeyOf } from '../utils/company-key.js';
import { ReviewResearchService } from './review-research.service.js';
import {
  confidenceOf,
  pickReviewSources,
  pickSnippetSources,
  trimToReviewText,
} from '../utils/review-sources.js';
import type { ModelStreamEvent } from '../../../common/stream-event.js';

const BRIEF_TIMEOUT_MS = 120_000;
const TTL_DAYS = 60;
const MAX_SOURCES = 5;

/** Nguồn chỉ có đoạn trích, thêm SAU các trang đọc được. */
const MAX_SNIPPETS = 2;

/** Trần chữ MỖI nguồn. Năm nguồn nhân trần này là toàn bộ đầu vào của model. */
const SOURCE_BUDGET = 5_000;

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly research: ReviewResearchService,
  ) {}

  /** Bản tìm hiểu của một tin: tra theo `jobId`, không theo tên tự do. */
  async forJob(jobId: string): Promise<BriefView> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { company: true },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy tin: ${jobId}`);

    const nameKey = companyKeyOf(job.company);
    if (!nameKey) {
      return {
        company: job.company,
        researchable: false,
        brief: null,
        stale: false,
      };
    }

    const brief = await this.prisma.companyBrief.findUnique({
      where: { nameKey },
    });

    return {
      company: job.company,
      researchable: true,
      brief,
      stale: brief !== null && brief.expiresAt.getTime() <= Date.now(),
    };
  }

  /** Payload cho hàng đợi, `null` khi bản hiện có còn hạn. */
  async planRefresh(
    jobId: string,
    force: boolean,
  ): Promise<CompanyBriefPayload | null> {
    const view = await this.forJob(jobId);
    if (!view.researchable) {
      throw new BadRequestException(
        `Tin này không ghi rõ công ty: "${view.company}"`,
      );
    }
    if (view.brief && !view.stale && !force) return null;

    return {
      nameKey: companyKeyOf(view.company)!,
      company: view.company,
      force,
    };
  }

  /** Tìm hiểu một công ty: ba câu tìm kiếm, năm trang, một lời gọi model. */
  async *streamBuild(
    company: string,
  ): AsyncGenerator<ModelStreamEvent<BriefRecord>> {
    const prepared = await this.prepare(company);

    try {
      if (prepared.sources.length === 0) {
        yield { type: 'done', result: await this.saveEmpty(prepared) };
        return;
      }

      const { partials, object, modelId } =
        await this.ai.streamObject<CompanyBrief>({
          schema: companyBriefSchema,
          context: { purpose: 'company.brief' },
          system: BRIEF_SYSTEM,
          prompt: buildBriefPrompt(company, prepared.sources),
          timeoutMs: BRIEF_TIMEOUT_MS,
        });

      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }

      yield {
        type: 'done',
        result: await this.save(prepared, await object, modelId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tìm hiểu (stream) "${company}" hỏng: ${message}`);
      yield { type: 'error', message };
    }
  }

  async build(company: string): Promise<BriefRecord> {
    const prepared = await this.prepare(company);
    if (prepared.sources.length === 0) return this.saveEmpty(prepared);

    const { object, modelId } = await this.ai.generateObject<CompanyBrief>({
      schema: companyBriefSchema,
      context: { purpose: 'company.brief' },
      system: BRIEF_SYSTEM,
      prompt: buildBriefPrompt(company, prepared.sources),
      timeoutMs: BRIEF_TIMEOUT_MS,
    });

    return this.save(prepared, object, modelId);
  }

  /** Phần chung của hai đường build. Ném NGOÀI `try` để công ty ẩn danh thành 400. */
  private async prepare(company: string): Promise<PreparedBrief> {
    const nameKey = companyKeyOf(company);
    if (!nameKey) {
      throw new BadRequestException(
        `Không tìm hiểu được công ty ẩn danh: "${company}"`,
      );
    }

    return { nameKey, company, ...(await this.collectSources(company)) };
  }

  private saveEmpty(prepared: PreparedBrief): Promise<BriefRecord> {
    this.logger.warn(`Không đọc được nguồn nào về "${prepared.company}"`);
    return this.save(prepared, emptyBrief(), null);
  }

  /** Nguồn đưa vào model; trang chặn vẫn giữ lại bằng đoạn trích Google. */
  private async collectSources(company: string): Promise<{
    sources: NumberedSource[];
    unreachable: Array<{ url: string; title: string }>;
  }> {
    if (!this.research.enabled) return { sources: [], unreachable: [] };

    const hits = (
      await Promise.all(
        briefQueries(company).map((query) => this.research.search(query)),
      )
    ).flat();

    const unreachable: Array<{ url: string; title: string }> = [];
    const pages: Array<NumberedSource | null> = await Promise.all(
      pickReviewSources(hits, MAX_SOURCES).map(async (hit) => {
        const text = await this.research.readPage(hit.url);
        if (text === null) {
          unreachable.push({ url: hit.url, title: hit.title });
          return null;
        }
        return {
          title: hit.title,
          url: hit.url,
          text: trimToReviewText(text, SOURCE_BUDGET),
          kind: 'page' as const,
        };
      }),
    );

    const snippets = pickSnippetSources(hits, MAX_SNIPPETS).map((hit) => ({
      title: hit.title,
      url: hit.url,
      text: hit.snippet,
      kind: 'snippet' as const,
    }));

    return {
      sources: [
        ...pages.filter((page): page is NumberedSource => page !== null),
        ...snippets,
      ],
      unreachable,
    };
  }

  /** Ghi bản tóm tắt xuống database, upsert theo `nameKey`. */
  private save(
    prepared: PreparedBrief,
    brief: CompanyBrief,
    modelId: string | null,
  ): Promise<BriefRecord> {
    const { nameKey, company, sources, unreachable } = prepared;
    const checked = resolveSources(brief, sources, unreachable);
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);

    const data = {
      name: company,
      verdict: VERDICTS[brief.verdict],
      summary: brief.summary,
      pros: brief.pros,
      cons: brief.cons,
      confidence:
        CONFIDENCES[
          confidenceOf(
            checked.filter((s) => s.usedFor !== null).map((s) => s.url),
          )
        ],
      rating: brief.rating,
      reviewCount: brief.reviewCount,
      sources: checked,
      modelId,
      expiresAt,
    };

    return this.prisma.companyBrief.upsert({
      where: { nameKey },
      create: { nameKey, ...data },
      update: data,
    });
  }
}
