import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AgentRun, Prisma } from '../../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { STUCK_AFTER_MS } from '../../reconcile/services/reconcile.service.js';
import { CommandRegistryService } from './command-registry.service.js';
import { ASK_USER_TOOL } from '../tools/ask-user.tool.js';

/** Bộ lọc của đường đọc danh sách. Rỗng thì trả về mọi lượt chạy của người dùng. */
export type ListAgentRunsQuery = PaginationQueryDto & {
  jobId?: string;
  workflow?: string;
};

export type StartAgentInput = {
  workflow: string;
  jobId?: string;
  jobUrl?: string;
  jobDescription?: string;
  note?: string;
};

/** Đường ĐỌC và ĐẶT LỆNH cho agent. Việc chạy thật nằm ở `AgentRunnerService`. */
@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandRegistryService,
  ) {}

  /**
   * Tạo một lượt chạy. Kịch bản được nạp NGAY ở đây chứ không đợi tới worker:
   * gõ sai tên kịch bản thì người dùng phải biết ngay lúc bấm, chứ không phải
   * sau ba mươi giây nhìn một lượt chạy FAILED.
   */
  async start(userId: string, input: StartAgentInput): Promise<AgentRun> {
    await this.commands.get(input.workflow);

    if (!input.jobId && !input.jobUrl && !input.jobDescription) {
      throw new BadRequestException(
        'Cần một tin tuyển dụng đã lưu, một đường dẫn, hoặc nội dung tin dán tay',
      );
    }

    /*
     * Kiểm công việc có thật NGAY ở đây, cùng lý do với việc nạp kịch bản ở
     * dòng trên: mã sai thì người dùng biết lúc bấm, chứ không phải nhìn khoá
     * ngoại vỡ trong worker ba mươi giây sau.
     */
    if (input.jobId) {
      const job = await this.prisma.job.findUnique({
        where: { id: input.jobId },
        select: { id: true },
      });
      if (!job) {
        throw new NotFoundException(`Không tìm thấy công việc: ${input.jobId}`);
      }
    }

    /*
     * MỘT lượt đang chạy cho mỗi người, và đây là hạn ngạch chứ không phải sự
     * cẩn thận thừa.
     *
     * Một lượt tiêu 10-20 lời gọi model, mà hạn mức gateway tính theo model và
     * dùng chung cho cả hệ thống. Không chặn thì một người bấm năm lần là năm
     * lượt cùng chạy, cạn hạn mức, và MỌI người dùng khác nhận lỗi UPSTREAM cho
     * tới khi hết giờ phạt.
     *
     * `WAITING_USER` KHÔNG bị chặn: lượt đó đang chờ người, không tiêu gì cả.
     */
    await this.assertNoRunInFlight(userId);

    return this.prisma.agentRun.create({
      data: {
        userId,
        workflow: input.workflow,
        jobId: input.jobId ?? null,
        input: {
          jobUrl: input.jobUrl ?? null,
          jobDescription: input.jobDescription ?? null,
          note: input.note ?? null,
        },
      },
    });
  }

  /**
   * Ghi câu trả lời của người dùng và đưa lượt chạy về hàng đợi.
   *
   * Chỉ nhận khi lượt chạy đang chờ: trả lời một lượt đã DONE thì không có chỗ
   * nào để câu trả lời đó đi vào, còn trả lời một lượt đang RUNNING sẽ tạo ra
   * hai worker cùng ghi vào một hội thoại.
   */
  async answer(userId: string, runId: string, text: string): Promise<AgentRun> {
    const run = await this.get(userId, runId);

    if (run.status !== 'WAITING_USER') {
      throw new BadRequestException(
        `Lượt chạy đang ở trạng thái ${run.status}, không chờ câu trả lời nào.`,
      );
    }

    await this.recordAnswerOnStep(runId, text);

    return this.prisma.agentRun.update({
      where: { id: runId },
      data: { answer: text, status: 'PENDING', question: run.question },
    });
  }

  /**
   * Ghi câu trả lời vào chính bước đã hỏi, chứ không chỉ vào `AgentRun.answer`.
   *
   * `answer` giữ ĐÚNG MỘT câu - lượt sau ghi đè lượt trước. Với `/apply` thì đủ
   * (agent hỏi một lần), nhưng một buổi luyện phỏng vấn hỏi cả chục lần và giá
   * trị của nó nằm ở chỗ đọc lại được cả buổi. Không lưu thì tải lại trang là
   * mất sạch phần người dùng đã nói.
   *
   * Chỗ lưu là `toolResults` của bước `ask_user`, không phải một bảng mới hay
   * một bước mới: câu trả lời CHÍNH LÀ kết quả của lời gọi tool đó, chỉ là nó
   * về muộn vài phút. `messages` không dùng được cho việc này - đó là trạng thái
   * máy, cố ý không trộn với nhật ký cho người đọc.
   */
  private async recordAnswerOnStep(runId: string, text: string): Promise<void> {
    const step = await this.prisma.agentStep.findFirst({
      where: { runId },
      orderBy: { index: 'desc' },
      select: { id: true, toolResults: true },
    });

    if (!step || !Array.isArray(step.toolResults)) return;

    const results = step.toolResults as Array<{
      tool?: string;
      output?: Record<string, unknown>;
    }>;
    const asked = results.find((result) => result?.tool === ASK_USER_TOOL);
    if (!asked) return;

    asked.output = { ...(asked.output ?? {}), answer: text };

    await this.prisma.agentStep.update({
      where: { id: step.id },
      data: { toolResults: results as Prisma.InputJsonValue },
    });
  }

  /**
   * Chạy lại một lượt đã hỏng, TIẾP từ chỗ nó dừng nếu còn điểm khôi phục.
   *
   * Không tạo bản ghi mới: các bước cũ, file đã ghi và hội thoại đều thuộc về
   * lượt này, và người dùng đang nhìn đúng nó. `AgentRunnerService` tự chọn
   * đường - có `messages` thì đi tiếp, không có thì bắt đầu lại từ chính đầu
   * vào cũ, nên người dùng không phải dán lại mô tả công việc.
   *
   * Chỉ nhận lượt FAILED. Đây là chỗ duy nhất xếp lại việc đã hỏng, và nó do
   * NGƯỜI DÙNG bấm - hệ thống không bao giờ tự thử lại, vì chưa có bộ đếm số
   * lần thử thì tự động thử lại là một vòng lặp tốn tiền.
   */
  async retry(userId: string, runId: string): Promise<AgentRun> {
    const run = await this.get(userId, runId);

    /*
     * Nhận cả lượt đang KẸT, không chỉ lượt FAILED.
     *
     * Bản ghi chỉ chuyển sang FAILED từ trong `catch` của worker; tiến trình
     * chết giữa chừng thì không `catch` nào chạy và lượt chạy nằm RUNNING mãi.
     * `ReconcileService` dọn chúng, nhưng nó chạy theo chu kỳ - trong lúc chờ,
     * người dùng phải có đường thoát ngay chứ không bị khoá cứng.
     */
    if (run.status !== 'FAILED' && !this.isStale(run)) {
      throw new BadRequestException(
        `Lượt chạy đang ở trạng thái ${run.status}, chỉ chạy lại được lượt đã thất bại hoặc đã kẹt.`,
      );
    }

    await this.assertNoRunInFlight(userId);

    return this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'PENDING', error: null, finishedAt: null },
    });
  }

  /**
   * Lượt chạy đã im lặng quá lâu để còn coi là đang chạy.
   *
   * Dùng chung mốc với `ReconcileService` để hai nơi không nói khác nhau về
   * cùng một bản ghi.
   */
  private isStale(run: { updatedAt: Date }): boolean {
    return Date.now() - run.updatedAt.getTime() > STUCK_AFTER_MS;
  }

  /**
   * Chặn người dùng mở lượt thứ hai khi lượt cũ còn đang chạy.
   *
   * Lượt KẸT không tính: nếu tính thì một tiến trình chết giữa chừng sẽ khoá
   * người dùng ngoài tính năng cho tới lượt quét dọn kế tiếp.
   */
  private async assertNoRunInFlight(userId: string): Promise<void> {
    const running = await this.prisma.agentRun.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'RUNNING'] },
        updatedAt: { gte: new Date(Date.now() - STUCK_AFTER_MS) },
      },
      select: { id: true },
    });

    if (running) {
      throw new ConflictException(
        'Bạn đang có một lượt chạy chưa xong. Đợi nó kết thúc rồi hãy chạy lượt mới.',
      );
    }
  }

  async get(userId: string, runId: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId },
      include: { steps: { orderBy: { index: 'asc' } } },
    });
    if (!run) throw new NotFoundException(`Không tìm thấy lượt chạy: ${runId}`);
    return run;
  }

  async list(userId: string, query: ListAgentRunsQuery) {
    const where = {
      userId,
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.workflow ? { workflow: query.workflow } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          workflow: true,
          status: true,
          question: true,
          modelId: true,
          error: true,
          createdAt: true,
          finishedAt: true,
          /*
           * Kèm tên vị trí, không chỉ `jobId`: danh sách buổi luyện phải đọc
           * được bằng mắt ("Backend Engineer - Nexa Software"), mà bắt giao diện
           * gọi thêm một request cho mỗi dòng là N+1 ngay trên đường đọc.
           * `job` có thể null - tin tuyển dụng bị dọn đi thì buổi luyện vẫn còn.
           */
          jobId: true,
          job: { select: { title: true, company: true } },
          _count: { select: { steps: true } },
        },
      }),
      this.prisma.agentRun.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  /** Danh sách kịch bản đang có trong `.claude/commands/`. */
  workflows(): Promise<string[]> {
    return this.commands.list();
  }
}
