export interface RunLite {
  id: string;
  portal: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  userId: string | null;
  userEmail: string | null;
  jobsFound: number;
  jobsNew: number;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Cron và nút "Quét ngay" tạo mọi portal trong vài giây; hai lượt cách nhau quá mức này là hai lượt khác nhau. */
export const BATCH_GAP_MS = 5 * 60 * 1000;

export interface Batch {
  id: string;
  startedAt: Date;
  /** Có lượt do một tài khoản tự chạy, không phải cron hay nút "Quét ngay" của admin. */
  manual: boolean;
  userEmail: string | null;
  runs: Record<string, RunLite>;
  totalNew: number;
  failed: number;
}

/** Gom lượt quét (mới nhất trước) thành lượt đêm: cùng chủ, tạo gần nhau, mỗi portal xuất hiện một lần. */
export function groupBatches(runs: RunLite[]): Batch[] {
  const sorted = [...runs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const batches: Batch[] = [];
  let current: Batch | null = null;
  let anchor = 0;

  for (const run of sorted) {
    const fits =
      current &&
      anchor - run.createdAt.getTime() <= BATCH_GAP_MS &&
      !current.runs[run.portal] &&
      (current.manual ? run.userId !== null : run.userId === null);

    if (!fits) {
      current = {
        id: run.id,
        startedAt: run.createdAt,
        manual: run.userId !== null,
        userEmail: run.userEmail,
        runs: {},
        totalNew: 0,
        failed: 0,
      };
      anchor = run.createdAt.getTime();
      batches.push(current);
    }

    const batch = current as Batch;
    batch.runs[run.portal] = run;
    batch.startedAt = run.createdAt;
    batch.totalNew += run.jobsNew;
    if (run.status === 'FAILED') batch.failed += 1;
  }
  return batches;
}

/** Số lượt gần nhất đưa vào đường xu hướng của mỗi portal. */
export const TREND_RUNS = 14;

export interface PortalStats {
  portal: string;
  runs: number;
  failed: number;
  /** Số lượt hỏng liên tiếp tính từ lượt mới nhất; >0 nghĩa là portal đang hỏng. */
  failStreak: number;
  lastRun: RunLite | null;
  lastSuccessAt: Date | null;
  /** Tin mới của các lượt gần nhất, cũ trước mới sau. */
  newSeries: number[];
  /** Lượt xong gần nhất lấy đủ trần `maxJobsPerPortal`: portal còn tin nhưng bị cắt. */
  hitCap: boolean;
}

/** Tình trạng một portal từ các lượt của nó (thứ tự bất kỳ). */
export function portalStats(
  portal: string,
  runs: RunLite[],
  cap: number,
): PortalStats {
  const mine = runs
    .filter((run) => run.portal === portal)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, TREND_RUNS);

  let failStreak = 0;
  for (const run of mine) {
    if (run.status !== 'FAILED') break;
    failStreak += 1;
  }
  const lastDone = mine.find((run) => run.status === 'DONE') ?? null;

  return {
    portal,
    runs: mine.length,
    failed: mine.filter((run) => run.status === 'FAILED').length,
    failStreak,
    lastRun: mine[0] ?? null,
    lastSuccessAt: lastDone?.finishedAt ?? lastDone?.createdAt ?? null,
    newSeries: mine
      .filter((run) => run.status === 'DONE')
      .map((run) => run.jobsNew)
      .reverse(),
    hitCap: lastDone !== null && lastDone.jobsFound >= cap,
  };
}
