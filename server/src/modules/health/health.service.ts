import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  LATEX_COMPILER,
  PDF_RENDERER,
  type LatexCompiler,
  type PdfRenderer,
} from '../documents/pdf/seam';
import { QueueService } from '../queue/queue.service';
import { messageOf } from '@/common/error-message';

const CHECK_TIMEOUT_MS = 2_000;

export type CheckResult = { ok: boolean; error?: string };

export type ReadinessReport = {
  ready: boolean;
  checks: {
    database: CheckResult;
    queue: CheckResult;
    latex: CheckResult;
    pdf: CheckResult;
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
      error: messageOf(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const probe = (
  target: { available(): Promise<boolean> },
  label: string,
  message: string,
) =>
  withTimeout(
    target.available().then((ok) => {
      if (!ok) throw new Error(message);
    }),
    label,
  );

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(LATEX_COMPILER) private readonly latex: LatexCompiler,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const status = this.queue.status();
    const queue: CheckResult = status.ready
      ? { ok: true }
      : { ok: false, error: status.error ?? 'hàng đợi chưa khởi tạo xong' };

    const [database, latex, pdf] = await Promise.all([
      withTimeout(this.prisma.$queryRawUnsafe('SELECT 1'), 'database'),
      probe(this.latex, 'latex', 'môi trường tạo PDF không phản hồi'),
      probe(this.pdf, 'pdf', 'môi trường in PDF không phản hồi'),
    ]);

    return {
      ready: database.ok && queue.ok,
      checks: { database, queue, latex, pdf },
    };
  }
}
