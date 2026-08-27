import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { CompanyBrief as BriefRecord } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import type { CompanyBriefPayload } from '../queue/queue.service.js';
import { confidenceOf } from './brief/brief-confidence.js';
import {
  BRIEF_SYSTEM,
  briefQueries,
  buildBriefPrompt,
  type NumberedSource,
} from './brief/company-brief.prompt.js';
import {
  companyBriefSchema,
  type CompanyBrief,
} from './brief/company-brief.schema.js';
import { companyKeyOf } from './company-key.js';
import { ReviewResearchService } from './research/review-research.service.js';
import {
  pickReviewSources,
  pickSnippetSources,
} from './research/review-sources.js';
import { trimToReviewText } from './research/review-text.js';
import type { ModelStreamEvent } from '../../common/stream-event.js';

const BRIEF_TIMEOUT_MS = 120_000;
const TTL_DAYS = 60;
const MAX_SOURCES = 5;

/** Nguồn chỉ có đoạn trích, thêm SAU các trang đọc được. */
const MAX_SNIPPETS = 2;

/** Trần chữ MỖI nguồn. Năm nguồn nhân trần này là toàn bộ đầu vào của model. */
const SOURCE_BUDGET = 5_000;

const VERDICTS = {
  positive: 'POSITIVE',
  mixed: 'MIXED',
  negative: 'NEGATIVE',
  no_reviews_yet: 'NO_REVIEWS_YET',
  unknown: 'UNKNOWN',
} as const;

const CONFIDENCES = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' } as const;

/**
 * `read` đọc được cả trang · `snippet` chỉ có đoạn trích Google · `unreachable`
 * tìm ra nhưng không đọc được.
 */
export type SourceStatus = 'read' | 'snippet' | 'unreachable';

/**
 * Mọi nguồn ĐÃ KIỂM, không chỉ nguồn model dùng được. `usedFor` là `null` khi
 * đã đọc mà không rút ra được gì - đó vẫn là thông tin: nó nói cho người dùng
 * biết chỗ nào đã tra rồi, thay vì để họ tự đi Google lại đúng những chỗ đó.
 */
export type BriefSource = {
  url: string;
  title: string;
  usedFor: string | null;
  status: SourceStatus;
};

export type BriefView = {
  company: string;
  /** `false` khi công ty ẩn danh - giao diện không hiện nút tìm hiểu. */
  researchable: boolean;
  brief: BriefRecord | null;
  /** Quá hạn nhưng vẫn hiện, kèm nhãn và nút làm mới. */
  stale: boolean;
};

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly research: ReviewResearchService,
  ) {}

  /** Đường đọc: chỉ truy vấn SQL, không bao giờ gọi model. */
  async find(company: string): Promise<BriefRecord | null> {
    const nameKey = companyKeyOf(company);
    if (!nameKey) return null;

    return this.prisma.companyBrief.findUnique({ where: { nameKey } });
  }

  /**
   * Bản tìm hiểu gắn với một tin tuyển dụng. Tra theo tin chứ không theo tên tự
   * do người gọi truyền lên: chỉ công ty đã có tin trong database mới tra được.
   */
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

  /**
   * Payload cho hàng đợi, hoặc `null` khi bản hiện có còn hạn - lúc đó chạy lại
   * chỉ tốn một lượt gọi model để ra đúng thứ đang hiển thị.
   */
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

  /**
   * Tìm hiểu một công ty và lưu lại. Gọi từ worker, không từ HTTP: một lượt đi
   * qua ba câu tìm kiếm, năm trang và một lời gọi model.
   */
  async *streamBuild(
    company: string,
  ): AsyncGenerator<ModelStreamEvent<BriefRecord>> {
    const nameKey = companyKeyOf(company);
    if (!nameKey) {
      throw new BadRequestException(
        `Không tìm hiểu được công ty ẩn danh: "${company}"`,
      );
    }

    try {
      const { sources, unreachable } = await this.collectSources(company);
      if (sources.length === 0) {
        this.logger.warn(`Không đọc được nguồn nào về "${company}"`);
        yield {
          type: 'done',
          result: await this.save(
            nameKey,
            company,
            emptyBrief(),
            [],
            unreachable,
            null,
          ),
        };
        return;
      }

      const { partials, object, modelId } =
        await this.ai.streamObject<CompanyBrief>({
          schema: companyBriefSchema,
          context: { purpose: 'company.brief' },
          system: BRIEF_SYSTEM,
          prompt: buildBriefPrompt(company, sources),
          timeoutMs: BRIEF_TIMEOUT_MS,
        });

      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }

      const final = await object;
      yield {
        type: 'done',
        result: await this.save(
          nameKey,
          company,
          final,
          sources,
          unreachable,
          modelId,
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Tìm hiểu (stream) "${company}" hỏng: ${message}`);
      yield { type: 'error', message };
    }
  }

  async build(company: string): Promise<BriefRecord> {
    const nameKey = companyKeyOf(company);
    if (!nameKey) {
      throw new BadRequestException(
        `Không tìm hiểu được công ty ẩn danh: "${company}"`,
      );
    }

    const { sources, unreachable } = await this.collectSources(company);
    if (sources.length === 0) {
      this.logger.warn(`Không đọc được nguồn nào về "${company}"`);
      return this.save(nameKey, company, emptyBrief(), [], unreachable, null);
    }

    const { object, modelId } = await this.ai.generateObject<CompanyBrief>({
      schema: companyBriefSchema,
      context: { purpose: 'company.brief' },
      system: BRIEF_SYSTEM,
      prompt: buildBriefPrompt(company, sources),
      timeoutMs: BRIEF_TIMEOUT_MS,
    });

    return this.save(nameKey, company, object, sources, unreachable, modelId);
  }

  /**
   * Nguồn đưa vào model, kèm danh sách trang tìm ra mà không đọc được.
   *
   * Trang chặn được đưa vào bằng đoạn trích Google thay vì bỏ hẳn: với công ty
   * nhỏ, bài hỏi trong nhóm Facebook thường là tín hiệu người-thật duy nhất, mà
   * đoạn trích thì đã trả tiền cho Serper rồi.
   */
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

  /**
   * Ghép câu trả lời của model vào danh sách nguồn đã kiểm.
   *
   * Số thứ tự ngoài khoảng bị bỏ - đó là dấu hiệu model đếm sai, không phải một
   * nguồn thật. Nguồn model KHÔNG dùng vẫn được giữ với `usedFor: null`, vì
   * "đã tra chỗ này rồi, không có gì" cũng là câu trả lời người dùng cần.
   */
  private resolveSources(
    brief: CompanyBrief,
    sources: NumberedSource[],
    unreachable: Array<{ url: string; title: string }>,
  ): BriefSource[] {
    const usedFor = new Map<number, string>();
    for (const used of brief.usedSources) {
      if (sources[used.index - 1] && !usedFor.has(used.index)) {
        usedFor.set(used.index, used.usedFor);
      }
    }

    return [
      ...sources.map((source, index) => ({
        url: source.url,
        title: source.title,
        usedFor: usedFor.get(index + 1) ?? null,
        status:
          source.kind === 'snippet' ? ('snippet' as const) : ('read' as const),
      })),
      ...unreachable.map((source) => ({
        ...source,
        usedFor: null,
        status: 'unreachable' as const,
      })),
    ];
  }

  private save(
    nameKey: string,
    name: string,
    brief: CompanyBrief,
    sources: NumberedSource[],
    unreachable: Array<{ url: string; title: string }>,
    modelId: string | null,
  ): Promise<BriefRecord> {
    const checked = this.resolveSources(brief, sources, unreachable);
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000);

    const data = {
      name,
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

/** Không đọc được nguồn nào vẫn phải lưu, nếu không mỗi lượt xem lại tra lại. */
function emptyBrief(): CompanyBrief {
  return {
    verdict: 'unknown',
    summary: 'Chưa tìm được nguồn đánh giá công khai nào về công ty này.',
    pros: [],
    cons: [],
    rating: null,
    reviewCount: null,
    usedSources: [],
  };
}
