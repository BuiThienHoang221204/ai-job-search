import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AgentRun } from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CommandRegistryService } from './command-registry.service.js';

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

    return this.prisma.agentRun.update({
      where: { id: runId },
      data: { answer: text, status: 'PENDING', question: run.question },
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

    if (run.status !== 'FAILED') {
      throw new BadRequestException(
        `Lượt chạy đang ở trạng thái ${run.status}, chỉ chạy lại được lượt đã thất bại.`,
      );
    }

    await this.assertNoRunInFlight(userId);

    return this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'PENDING', error: null, finishedAt: null },
    });
  }

  /** Chặn người dùng mở lượt thứ hai khi lượt cũ còn đang chạy. */
  private async assertNoRunInFlight(userId: string): Promise<void> {
    const running = await this.prisma.agentRun.findFirst({
      where: { userId, status: { in: ['PENDING', 'RUNNING'] } },
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

  async list(userId: string, query: PaginationQueryDto) {
    const where = { userId };

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
