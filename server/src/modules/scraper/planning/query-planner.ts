import { Logger } from '@nestjs/common';
import type { Profile } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import { PromptBuilderService } from '../../skills/services/prompt-builder.service.js';
import { MIN_COMPLETION_TO_SCORE } from '../fan-out.js';
import {
  clusterProfiles,
  clusterQuery,
  planFromProfile,
} from './query-plan.js';
import { searchPlanSchema, type SearchPlan } from './search-plan.schema.js';

/**
 * Quyết định lượt quét sẽ tìm bằng những từ khoá nào.
 *
 * Hai đường rất khác nhau và cố ý tách rời: lượt quét theo NGƯỜI DÙNG đi qua
 * model để tinh chỉnh từ khoá theo đúng ngành của họ, còn lượt quét của HỆ
 * THỐNG gom hồ sơ thành cụm ngành và không gọi model lần nào.
 */
export class QueryPlanner {
  private readonly logger = new Logger(QueryPlanner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptBuilderService,
    private readonly systemQueryLimit: number,
  ) {}

  /** Sinh truy vấn trực tiếp từ hồ sơ, không gọi AI. */
  private deterministicQueries(profile: Profile | null): SearchPlan {
    return { queries: planFromProfile(profile) };
  }

  /** Tinh chỉnh truy vấn bằng AI. Tùy chọn: hỏng thì dùng bản tất định. */
  private async refineQueries(
    profile: Profile | null,
    userId: string,
  ): Promise<{
    plan: SearchPlan;
    modelId: string;
  }> {
    const system = [
      'Bạn sinh từ khóa tìm việc cho một ứng viên tại Việt Nam. Ứng viên có thể thuộc BẤT KỲ ngành nghề nào - hãy đọc hồ sơ để biết, đừng giả định.',
      '',
      'Quy tắc bắt buộc:',
      '- Từ khóa phải NGẮN, 1-4 từ. KHÔNG đặt câu.',
      '- NGÔN NGỮ theo ngành: chức danh ngành CNTT và kỹ thuật thì dùng TIẾNG ANH ("frontend developer", "devops engineer") vì tin tuyển dụng nhóm này ở Việt Nam đăng bằng tiếng Anh. MỌI ngành còn lại dùng TIẾNG VIỆT CÓ DẤU ("kế toán tổng hợp", "nhân viên kinh doanh", "chuyên viên tuyển dụng") vì tin của họ đăng bằng tiếng Việt. Chọn sai ngôn ngữ thì không tìm được tin nào.',
      '- Chỉ dùng kỹ năng và chức danh CÓ THẬT trong hồ sơ. Không sinh từ khóa cho việc ứng viên chưa từng làm.',
      '- Địa điểm phải khớp ràng buộc đi lại của ứng viên. Ứng viên không chấp nhận chuyển nơi ở thì chỉ tìm tại thành phố họ đang sống.',
      '- Truy vấn đầu tiên là CHỨC DANH hiện tại của ứng viên. Chức danh là thứ nhà tuyển dụng dùng để đặt tên tin, nên nó tìm đúng hơn kỹ năng ở mọi ngành.',
      '- Các truy vấn sau ghép chức danh với lĩnh vực mục tiêu, rồi mới tới kỹ năng chính. Không được lạc sang nghề khác.',
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
    ].join('\n');

    const { object, modelId } = await this.ai.generateObject<SearchPlan>({
      schema: searchPlanSchema,
      context: { purpose: 'scrape.plan', userId },
      system,
      prompt,
      timeoutMs: 30_000,
      maxRetries: 0,
    });
    return { plan: object, modelId };
  }

  async forUser(
    profile: Profile | null,
    userId: string,
  ): Promise<{
    plan: SearchPlan;
    modelId: string | null;
  }> {
    const baseline = this.deterministicQueries(profile);
    if (!baseline.queries.length) {
      return { plan: baseline, modelId: null };
    }

    try {
      const refined = await this.refineQueries(profile, userId);
      this.logger.log(`Truy vấn do ${refined.modelId} tinh chỉnh`);
      return refined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Tinh chỉnh truy vấn thất bại (${message}); dùng bản tất định`,
      );
      return { plan: baseline, modelId: null };
    }
  }

  /**
   * Từ khoá cho lần quét của hệ thống: MỘT từ khoá cho mỗi NGÀNH có người dùng.
   *
   * Khi số ngành vượt trần truy vấn, chọn theo độ cũ trước rồi mới tới số hồ sơ
   * - nhờ vậy độ phủ là một chu kỳ vài đêm thay vì một nhóm cố định luôn thắng.
   * Trả về cả danh sách ngành đã chọn để đóng dấu sau khi quét xong.
   */
  async forSystem(
    portal: string,
  ): Promise<{ plan: SearchPlan; occupations: string[] }> {
    const profiles = await this.prisma.profile.findMany({
      where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: { headline: true, primarySkills: true, occupationCode: true },
    });

    const clusters = clusterProfiles(profiles);
    const marks = await this.prisma.occupationCrawl.findMany({
      where: {
        portal,
        occupationCode: { in: clusters.map((c) => c.occupationCode) },
      },
      select: { occupationCode: true, lastCrawledAt: true },
    });

    const crawledAt = new Map(
      marks.map((mark) => [mark.occupationCode, mark.lastCrawledAt.getTime()]),
    );

    // Ngành chưa từng quét đứng trước tất cả: 0 nhỏ hơn mọi mốc thời gian thật.
    const picked = [...clusters]
      .sort(
        (a, b) =>
          (crawledAt.get(a.occupationCode) ?? 0) -
            (crawledAt.get(b.occupationCode) ?? 0) || b.size - a.size,
      )
      .slice(0, this.systemQueryLimit);

    return {
      plan: { queries: picked.map(clusterQuery) },
      occupations: picked.map((cluster) => cluster.occupationCode),
    };
  }

  /** Đóng dấu "đã quét" cho những ngành vừa dùng, để lượt sau nhường ngành khác. */
  async markCrawled(portal: string, occupations: string[]): Promise<void> {
    const now = new Date();
    for (const occupationCode of occupations) {
      await this.prisma.occupationCrawl.upsert({
        where: { portal_occupationCode: { portal, occupationCode } },
        create: { portal, occupationCode, lastCrawledAt: now },
        update: { lastCrawledAt: now },
      });
    }
  }
}
