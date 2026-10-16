import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import type { CompanyBriefPayload } from '@/modules/queue/queue.service';
import {
  briefCall,
  briefQueries,
  type NumberedSource,
} from '../utils/company-brief.prompt';
import {
  briefViewOf,
  emptyBrief,
  forceTooSoon,
  PUBLIC_BRIEF_SELECT,
  resolveSources,
  VERDICTS,
  type BriefView,
  type CompanyBrief,
  type PreparedBrief,
  type PublicBriefRow,
} from '../utils/company-brief';
import { companyKeyOf } from '../utils/company-key';
import { ReviewResearchService } from './review-research.service';
import {
  confidenceOf,
  pickReviewSources,
  pickSnippetSources,
  trimToReviewText,
} from '../utils/review-sources';
import type { ModelStreamEvent } from '@/common/stream-event';
import { streamFailureEvent } from '@/common/ai/failure-view';
import { messageOf } from '@/common/error-message';
import { DAY_MS } from '@/common/duration';

const TTL_DAYS = 60;

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly research: ReviewResearchService,
  ) {}

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

    const row = await this.prisma.companyBrief.findUnique({
      where: { nameKey },
      select: PUBLIC_BRIEF_SELECT,
    });

    return briefViewOf(job.company, row, Date.now());
  }

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
    if (view.brief && force && forceTooSoon(view.brief.updatedAt, Date.now())) {
      throw new ConflictException(
        'Bản tìm hiểu công ty này vừa được làm mới. Hãy thử lại sau khoảng một giờ.',
      );
    }

    return {
      nameKey: companyKeyOf(view.company)!,
      company: view.company,
      force,
    };
  }

  async *streamBuild(
    company: string,
  ): AsyncGenerator<ModelStreamEvent<PublicBriefRow>> {
    const prepared = await this.prepare(company);

    try {
      if (prepared.sources.length === 0) {
        yield { type: 'done', result: await this.saveEmpty(prepared) };
        return;
      }

      const { partials, object, modelId } = await this.ai.streamObject(
        briefCall(company, prepared.sources),
      );

      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }

      yield {
        type: 'done',
        result: await this.save(prepared, await object, modelId),
      };
    } catch (error) {
      const message = messageOf(error);
      this.logger.error(`Tìm hiểu (stream) "${company}" hỏng: ${message}`);
      yield streamFailureEvent(error);
    }
  }

  async build(company: string): Promise<PublicBriefRow> {
    const prepared = await this.prepare(company);
    if (prepared.sources.length === 0) return this.saveEmpty(prepared);

    const { object, modelId } = await this.ai.generateObject(
      briefCall(company, prepared.sources),
    );

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

  private saveEmpty(prepared: PreparedBrief): Promise<PublicBriefRow> {
    this.logger.warn(`Không đọc được nguồn nào về "${prepared.company}"`);
    return this.save(prepared, emptyBrief(), null);
  }

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
      pickReviewSources(hits).map(async (hit) => {
        const text = await this.research.readPage(hit.url);
        if (text === null) {
          unreachable.push({ url: hit.url, title: hit.title });
          return null;
        }
        return {
          title: hit.title,
          url: hit.url,
          text: trimToReviewText(text),
          kind: 'page' as const,
        };
      }),
    );

    const snippets = pickSnippetSources(hits).map((hit) => ({
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
  ): Promise<PublicBriefRow> {
    const { nameKey, company, sources, unreachable } = prepared;
    const checked = resolveSources(brief, sources, unreachable);
    const expiresAt = new Date(Date.now() + TTL_DAYS * DAY_MS);

    const data = {
      name: company,
      verdict: VERDICTS[brief.verdict],
      summary: brief.summary,
      pros: brief.pros,
      cons: brief.cons,
      confidence: confidenceOf(
        checked.filter((s) => s.usedFor !== null).map((s) => s.url),
      ),
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
      select: PUBLIC_BRIEF_SELECT,
    });
  }
}
