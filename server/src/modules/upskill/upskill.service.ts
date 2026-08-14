import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Profile, UpskillReport } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { withFailureKind, withFailureKinds } from '../ai/failure-view.js';
import { PromptBuilderService } from '../skills/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/skill-registry.service.js';
import { upskillSchema, type UpskillResult } from './upskill.schema.js';

const SKILL_NAME = 'upskill';

/// Số công việc tối thiểu để báo cáo tổng hợp có ý nghĩa. Dưới ngưỡng này,
/// cái gọi là "xu hướng thị trường" chỉ là đặc điểm của vài tin tuyển dụng lẻ.
const MIN_JOBS_FOR_AGGREGATE = 3;

/// Lời gọi model nặng nhất trong hệ thống, nên nó có timeout riêng.
///
/// ĐO ĐƯỢC, không phỏng đoán: với mức 90 giây mặc định của `AiService`, chế độ
/// AGGREGATE thất bại đúng ở mốc 90 giây với "The operation was aborted due to
/// timeout" và `jobsAnalysed = 0` — nghĩa là màn Lộ trình học KHÔNG BAO GIỜ tạo
/// nổi một báo cáo tổng hợp trên gateway free. Nó nhồi tới 30 công việc (mỗi
/// công việc kèm 600 ký tự mô tả) rồi yêu cầu sinh ra hardGaps, synthesisedGaps,
/// learningPlan và summary trong một object; so với `match.evaluate` (p50 33s,
/// p95 82s cho MỘT công việc) thì mức 90 giây không bao giờ đủ.
///
/// Vì sao 4 phút là an toàn — ba mốc bao quanh nó, cả ba đều rộng hơn:
///   - reconcile coi việc là bị bỏ rơi sau `STUCK_AFTER_MS` = 10 phút,
///   - `server.setTimeout` trong `main.ts` là 5 phút, nên `generate-sync` vẫn kịp,
///   - cửa sổ giành quyền 5 phút của matching là đường khác và vẫn giữ 90 giây.
/// Nâng con số này lên quá 5 phút sẽ phá cả ba, đừng làm mà không sửa chúng.
const AGGREGATE_TIMEOUT_MS = 240_000;

@Injectable()
export class UpskillService {
  private readonly logger = new Logger(UpskillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
  ) {}

  /// Skill gốc đọc job_search_tracker.csv và dùng cột `fit_rating`. Ở đây bảng
  /// job_matches đóng đúng vai trò đó, còn `overallScore` chính là fit_rating.
  ///
  /// Trọng số lấy nguyên từ Step 3 của SKILL.md: (100 - fit) / 100. Công việc
  /// càng ít phù hợp càng lộ ra nhiều khoảng trống, nên đóng góp nhiều hơn.
  private async collectJobs(userId: string, jobId?: string) {
    if (jobId) {
      const match = await this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
        include: { job: true },
      });
      if (!match)
        throw new NotFoundException('Công việc này chưa được chấm điểm');
      return [match];
    }

    return this.prisma.jobMatch.findMany({
      where: { userId, status: 'DONE' },
      orderBy: { overallScore: 'asc' },
      take: 30,
      include: { job: true },
    });
  }

  async generate(reportId: string): Promise<UpskillReport> {
    const report = await this.prisma.upskillReport.findUnique({
      where: { id: reportId },
    });
    if (!report)
      throw new NotFoundException(`Không tìm thấy báo cáo: ${reportId}`);

    await this.prisma.upskillReport.update({
      where: { id: reportId },
      data: { status: 'RUNNING', error: null },
    });

    try {
      const [profile, matches] = await Promise.all([
        this.prisma.profile.findUnique({ where: { userId: report.userId } }),
        this.collectJobs(report.userId, report.jobId ?? undefined),
      ]);

      if (!matches.length) {
        throw new BadRequestException(
          'Chưa có công việc nào được chấm điểm. Hãy nạp tin tuyển dụng trước.',
        );
      }
      if (
        report.mode === 'AGGREGATE' &&
        matches.length < MIN_JOBS_FOR_AGGREGATE
      ) {
        throw new BadRequestException(
          `Cần ít nhất ${MIN_JOBS_FOR_AGGREGATE} công việc đã chấm điểm để tổng hợp, hiện có ${matches.length}.`,
        );
      }

      const { system, prompt } = this.buildPrompt(profile, matches);
      const { object, modelId } = await this.ai.generateObject<UpskillResult>({
        schema: upskillSchema,
        context: { purpose: 'upskill.report', userId: report.userId },
        system,
        prompt,
        // Chế độ TARGETED chỉ có một công việc nên vừa mức mặc định; chỉ
        // AGGREGATE mới cần nới.
        timeoutMs:
          report.mode === 'AGGREGATE' ? AGGREGATE_TIMEOUT_MS : undefined,
      });

      return await this.prisma.upskillReport.update({
        where: { id: reportId },
        data: {
          status: 'DONE',
          jobsAnalysed: matches.length,
          hardGaps: object.hardGaps,
          synthesisedGaps: object.synthesisedGaps,
          learningPlan: object.learningPlan,
          summary: object.summary,
          modelId,
          generatedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tạo báo cáo upskill thất bại (${reportId}): ${message}`,
      );
      return this.prisma.upskillReport.update({
        where: { id: reportId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  private buildPrompt(
    profile: Profile | null,
    matches: Array<{
      overallScore: number | null;
      gaps: string[];
      job: {
        title: string;
        company: string;
        tags: string[];
        description: string;
      };
    }>,
  ) {
    const skill = this.skills.get(SKILL_NAME);

    // SKILL.md của upskill là kịch bản từng bước cho agent (đọc CSV,
    // WebSearch, ghi file báo cáo). Chỉ lấy phần định nghĩa hai pass phân
    // tích; các bước thao tác file không áp dụng cho server.
    const framework = this.prompts.render(
      this.prompts.keepSections(skill.body, [
        'step 3',
        'step 4',
        'step 5',
        'step 6',
      ]),
      profile,
    );

    const system = [
      'Bạn là cố vấn phát triển nghề nghiệp. Phân tích khoảng cách giữa hồ sơ ứng viên và các vị trí họ đang nhắm tới, rồi đề xuất lộ trình học.',
      '',
      'Quy tắc bắt buộc:',
      '- Chỉ liệt kê kỹ năng mà tin tuyển dụng THẬT SỰ đòi hỏi và hồ sơ THẬT SỰ chưa có. Kỹ năng hồ sơ đã có dù chỉ ở dạng tương đương thì bỏ qua.',
      '- Công việc có điểm phù hợp thấp đóng góp nhiều hơn vào độ ưu tiên: trọng số là (100 - điểm) / 100.',
      '- synthesisedGaps không được lặp lại bất kỳ mục nào trong hardGaps.',
      '- Nguồn học phải là thứ có thật và gọi tên được. Không bịa URL.',
      '- Viết tiếng Việt có dấu, mỗi trường là câu hoàn chỉnh.',
      '',
      '--- KHUNG PHÂN TÍCH ---',
      framework,
    ].join('\n');

    const jobLines = matches.map((match, index) => {
      const fit = match.overallScore ?? 0;
      const weight = ((100 - fit) / 100).toFixed(2);
      return [
        `${index + 1}. ${match.job.title} @ ${match.job.company}`,
        `   điểm phù hợp: ${fit}/100, trọng số gap: ${weight}`,
        `   từ khóa: ${match.job.tags.join(', ') || 'không có'}`,
        match.gaps.length
          ? `   khoảng trống đã ghi nhận: ${match.gaps.join('; ')}`
          : '',
        `   trích mô tả: ${match.job.description.slice(0, 600)}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      '',
      `=== ${matches.length} CÔNG VIỆC ĐÃ CHẤM ĐIỂM (sắp theo điểm tăng dần) ===`,
      ...jobLines,
    ].join('\n');

    return { system, prompt };
  }

  async create(userId: string, jobId?: string) {
    return this.prisma.upskillReport.create({
      data: {
        userId,
        jobId: jobId ?? null,
        mode: jobId ? 'TARGETED' : 'AGGREGATE',
      },
    });
  }

  async latest(userId: string) {
    const report = await this.prisma.upskillReport.findFirst({
      where: { userId, status: 'DONE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!report) throw new NotFoundException('Chưa có báo cáo upskill nào');
    return withFailureKind(report);
  }

  async history(userId: string) {
    const reports = await this.prisma.upskillReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        mode: true,
        status: true,
        jobsAnalysed: true,
        summary: true,
        createdAt: true,
        generatedAt: true,
        error: true,
      },
    });
    return withFailureKinds(reports);
  }

  async get(userId: string, id: string) {
    const report = await this.prisma.upskillReport.findFirst({
      where: { id, userId },
    });
    if (!report) throw new NotFoundException(`Không tìm thấy báo cáo: ${id}`);
    return withFailureKind(report);
  }
}
