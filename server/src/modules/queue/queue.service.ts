import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import { appRole, runsBackgroundWork } from '../../config/app-role.js';
import { singletonKeyFor } from './queue-key.js';
import { type QueueConfigService } from './queue-config.service.js';

/** Policy áp cho mọi hàng đợi. */
const QUEUE_POLICY = 'exclusive';

export const QUEUE = {
  /** Chấm điểm một cặp (user, job). Đây là đường GHI của màn hình dashboard. */
  EVALUATE_MATCH: 'match.evaluate',
  /** Soạn bộ câu hỏi phỏng vấn cho một công việc. */
  INTERVIEW_PREP: 'interview.prep',
  /** Tổng hợp thiếu hụt kỹ năng trên toàn bộ công việc đã chấm. */
  UPSKILL_REPORT: 'upskill.report',
  /** Sinh CV / thư xin việc / câu trả lời form. */
  GENERATE_DOCUMENT: 'document.generate',
  /** Quét tin tuyển dụng từ portal rồi đẩy từng tin sang match.evaluate. */
  SCRAPE_RUN: 'scrape.run',
  /** Đọc CV/nguồn ngoài thành một ĐỀ XUẤT hồ sơ, chờ người dùng xác nhận. */
  PROFILE_SYNTHESIZE: 'profile.synthesize',
  /** Rút yêu cầu của MỘT tin, dùng chung cho mọi hồ sơ. Pha A. */
  EXTRACT_REQUIREMENTS: 'job.requirements',
  /** Tìm hiểu một công ty từ các trang đánh giá công khai. Khoá theo công ty, không theo người dùng. */
  COMPANY_BRIEF: 'company.brief',
  /** Chạy một kịch bản nhiều bước trong `.claude/commands/`. */
  AGENT_RUN: 'agent.run',
  /** Đối chiếu hồ sơ với yêu cầu đã rút. Thuần CPU, KHÔNG gọi model. */
  REQUIREMENT_MATCH: 'match.requirements',
  /** Quy các cách viết kỹ năng về một mã chuẩn. Chạy TRƯỚC bước đối chiếu. */
  SKILL_CANONICALIZE: 'skill.canonicalize',
} as const;

export type ExtractRequirementsPayload = {
  jobId: string;
  force?: boolean;
};

/** Một phía là đủ: có `jobId` thì tính lại theo tin, có `userId` thì theo hồ sơ. */
export type RequirementMatchPayload = {
  jobId?: string;
  userId?: string;
};

/** `round` = quét toàn kho, mỗi lượt một lô rồi tự xếp lượt kế. */
export type SkillCanonicalizePayload = RequirementMatchPayload & {
  round?: number;
};

export type EvaluateMatchPayload = {
  userId: string;
  jobId: string;
  force?: boolean;
};

export type InterviewPrepPayload = {
  userId: string;
  jobId: string;
  force?: boolean;
};

export type AgentRunPayload = {
  runId: string;
  userId: string;
};

/** Không có `userId`: bản tìm hiểu công ty dùng chung cho mọi người dùng. */
export type CompanyBriefPayload = {
  nameKey: string;
  company: string;
  force?: boolean;
};

export type UpskillReportPayload = {
  userId: string;
  reportId: string;
};

export type GenerateDocumentPayload = {
  userId: string;
  documentId: string;
};

export type ProfileSynthesizePayload = {
  userId: string;
  draftId: string;
};

export type ScrapeRunPayload = {
  runId: string;
  /**
   * Vắng mặt khi đây là lần quét của hệ thống do cron chạy. Worker chỉ cần
   * runId; chủ sở hữu đã nằm trong chính bản ghi ScrapeRun.
   */
  userId?: string;
};

/** Mặt tiếp xúc mà các module khác dùng để đẩy và nhận việc nền. */
export type Queue = Pick<
  QueueService,
  'send' | 'sendMany' | 'work' | 'status' | 'getStats'
>;

/** Trạng thái khởi tạo hàng đợi, dùng cho readiness probe. */
export type QueueStatus = { ready: boolean; error: string | null };

export type QueueStatsItem = {
  name: string;
  concurrency: number;
  size: number;
  active: number;
  total: number;
};

export type QueueStats = {
  queues: QueueStatsItem[];
  totalWaiting: number;
  totalActive: number;
};

/** Hàng đợi chạy trên chính Postgres, không cần Redis. */
@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private boss!: PgBoss;
  private started!: Promise<void>;

  /** Timer refresh config từ DB mỗi 30s. */
  private refreshTimer?: NodeJS.Timeout;

  /** Ghi lại kết quả khởi tạo để readiness probe đọc được. */
  private isStarted = false;
  private startupError: string | null = null;

  constructor(private readonly queueConfig: QueueConfigService) {}

  onModuleInit(): void {
    this.started = (async () => {
      try {
        const { PgBoss: PgBossClass } = await import('pg-boss');

        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) throw new Error('DATABASE_URL chưa được đặt');

        this.boss = new PgBossClass({
          connectionString,
          schema: 'pgboss',
          max: 10,
        });
        this.boss.on('error', (error: Error) =>
          this.logger.error('pg-boss lỗi', error),
        );

        await this.boss.start();
        for (const name of Object.values(QUEUE)) {
          await this.ensureQueue(name);
        }

        this.isStarted = true;
        this.logger.log(
          `Hàng đợi sẵn sàng (policy ${QUEUE_POLICY}): ${Object.values(QUEUE).join(', ')}`,
        );
        this.logger.log(
          `Vai tiến trình: ${appRole()}` +
            (runsBackgroundWork() ? '' : ' - KHÔNG đăng ký worker nào'),
        );

        // Bắt đầu poll config từ DB mỗi 30s
        this.refreshTimer = setInterval(() => {
          this.queueConfig.refreshCache().catch((err) => {
            this.logger.error('Lỗi refresh queue config', err);
          });
        }, 30_000);
      } catch (error) {
        this.startupError =
          error instanceof Error ? error.message : String(error);
        throw error;
      }
    })();
  }

  /** Trạng thái khởi tạo, cho readiness probe. */
  status(): QueueStatus {
    return { ready: this.isStarted, error: this.startupError };
  }

  /** Thống kê realtime tất cả hàng đợi. */
  async getStats(): Promise<QueueStats> {
    await this.started;
    const queues: QueueStatsItem[] = [];

    for (const name of Object.values(QUEUE)) {
      const q = await this.boss.getQueue(name);
      queues.push({
        name,
        concurrency: this.queueConfig.getConcurrency(name),
        size: (q?.queuedCount as number) ?? 0,
        active: (q?.activeCount as number) ?? 0,
        total: (q?.totalCount as number) ?? 0,
      });
    }

    return {
      queues,
      totalWaiting: queues.reduce((sum, q) => sum + q.size, 0),
      totalActive: queues.reduce((sum, q) => sum + q.active, 0),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.boss?.stop({ graceful: true });
  }

  /** Tạo hàng đợi, và nâng cấp policy nếu hàng đợi đã tồn tại với policy khác. */
  private async ensureQueue(name: string): Promise<void> {
    const existing = await this.boss.getQueue(name);

    if (!existing) {
      await this.boss.createQueue(name, { policy: QUEUE_POLICY });
      return;
    }
    if (existing.policy === QUEUE_POLICY) return;

    if (process.env.QUEUE_POLICY_MIGRATE !== 'true') {
      throw new Error(
        [
          `Hàng đợi "${name}" đang dùng policy "${existing.policy}", cần "${QUEUE_POLICY}" để chặn trùng việc.`,
          'pg-boss không cho đổi policy tại chỗ, nên phải xoá và tạo lại hàng đợi - việc đang chờ sẽ MẤT.',
          'Số việc chờ mà pg-boss báo là một cột được cập nhật định kỳ, không đáng tin để tự quyết định,',
          'nên bước này cần người xác nhận: chạy lại với QUEUE_POLICY_MIGRATE=true.',
        ].join('\n'),
      );
    }

    this.logger.warn(
      `Hàng đợi "${name}": QUEUE_POLICY_MIGRATE=true, xoá và tạo lại với policy ` +
        `${existing.policy} -> ${QUEUE_POLICY}. Việc đang chờ trong hàng đợi này bị bỏ.`,
    );
    await this.boss.deleteQueue(name);
    await this.boss.createQueue(name, { policy: QUEUE_POLICY });
  }

  /** Xếp một việc vào hàng đợi. */
  async send<T extends object>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string | null> {
    await this.started;
    return this.boss.send(queue, data, {
      ...options,
      singletonKey: singletonKeyFor(queue, data),
    });
  }

  /** Xếp NHIỀU việc bằng một lệnh. */
  async sendMany<T extends object>(queue: string, items: T[]): Promise<number> {
    await this.started;
    if (!items.length) return 0;

    const ids = await this.boss.insert(
      queue,
      items.map((data) => ({
        data,
        singletonKey: singletonKeyFor(queue, data),
      })),
      { returnId: true },
    );
    return ids?.length ?? 0;
  }

  /**
   * Đăng ký worker.
   *
   * `batchSize` giữ nguyên 1 và song song lấy từ `localConcurrency`, không phải
   * ngược lại: pg-boss áp kết quả handler cho CẢ lô ("throwing from the handler
   * still fails the whole batch"), nên gom lô khiến một việc hỏng kéo đổ những
   * việc lành cùng lô. `localConcurrency` sinh nhiều worker poll độc lập, mỗi
   * worker một việc, lỗi không lây.
   *
   * Vai `api` thoát ở đây thay vì để từng processor tự kiểm: đây là seam duy
   * nhất cả 7 processor đều đi qua, nên processor thêm sau này tự thừa hưởng.
   */
  async work<T extends object>(
    queue: string,
    handler: (data: T) => Promise<void>,
    options: WorkOptions = {},
  ): Promise<void> {
    if (!runsBackgroundWork()) {
      this.logger.debug(`Vai ${appRole()}: bỏ qua worker cho ${queue}`);
      return;
    }

    await this.started;
    const concurrency = this.queueConfig.getConcurrency(queue);
    await this.boss.work<T>(
      queue,
      {
        batchSize: 1,
        pollingIntervalSeconds: 2,
        localConcurrency: concurrency,
        ...options,
      },
      async (jobs) => {
        for (const job of jobs) await handler(job.data);
      },
    );
    this.logger.log(
      `Worker đang lắng nghe: ${queue} (song song ${concurrency})`,
    );
  }
}
