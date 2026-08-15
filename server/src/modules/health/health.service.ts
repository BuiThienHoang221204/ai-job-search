import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  LATEX_COMPILER,
  type LatexCompiler,
} from '../documents/latex-compile.js';
import { QueueService } from '../queue/queue.service.js';

/** Hạn cho từng phép kiểm tra. */
const CHECK_TIMEOUT_MS = 2_000;

export type CheckResult = { ok: boolean; error?: string };

export type ReadinessReport = {
  ready: boolean;
  checks: {
    database: CheckResult;
    queue: CheckResult;
    /** Môi trường tạo PDF. */
    latex: CheckResult;
  };
};

const withTimeout = async (
  work: Promise<unknown>,
  label: string,
): Promise<CheckResult> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`${label} không trả lời trong ${CHECK_TIMEOUT_MS}ms`),
            ),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(LATEX_COMPILER) private readonly latex: LatexCompiler,
  ) {}

  /** Các phụ thuộc đã sẵn sàng nhận việc hay chưa. */
  async readiness(): Promise<ReadinessReport> {
    const database = await withTimeout(
      this.prisma.$queryRawUnsafe('SELECT 1'),
      'database',
    );

    const status = this.queue.status();
    const queue: CheckResult = status.ready
      ? { ok: true }
      : { ok: false, error: status.error ?? 'hàng đợi chưa khởi tạo xong' };

    const latex = await withTimeout(
      this.latex.available().then((ok) => {
        if (!ok) throw new Error('môi trường tạo PDF không phản hồi');
      }),
      'latex',
    );

    return {
      ready: database.ok && queue.ok,
      checks: { database, queue, latex },
    };
  }
}
