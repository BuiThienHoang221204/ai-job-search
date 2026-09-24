import {
  groupBatches,
  portalStats,
  type RunLite,
} from 'src/modules/admin/utils/scrape-batches.js';

const at = (iso: string) => new Date(iso);

const run = (
  over: Partial<RunLite> & Pick<RunLite, 'id' | 'portal'>,
): RunLite => ({
  status: 'DONE',
  userId: null,
  userEmail: null,
  jobsFound: 50,
  jobsNew: 10,
  error: null,
  createdAt: at('2026-09-23T16:50:00Z'),
  finishedAt: at('2026-09-23T16:55:00Z'),
  ...over,
});

describe('groupBatches', () => {
  test('các portal tạo trong vài giây là một lượt đêm, mới nhất trước', () => {
    const batches = groupBatches([
      run({
        id: 'a1',
        portal: 'itviec',
        createdAt: at('2026-09-22T16:50:00Z'),
      }),
      run({
        id: 'b1',
        portal: 'itviec',
        createdAt: at('2026-09-23T16:50:00Z'),
      }),
      run({
        id: 'b2',
        portal: 'topcv',
        createdAt: at('2026-09-23T16:50:03Z'),
        jobsNew: 5,
      }),
    ]);
    expect(batches.map((batch) => Object.keys(batch.runs).sort())).toEqual([
      ['itviec', 'topcv'],
      ['itviec'],
    ]);
    expect(batches[0].totalNew).toBe(15);
  });

  test('cùng portal xuất hiện lần hai thì tách lượt dù sát giờ', () => {
    const batches = groupBatches([
      run({ id: 'x', portal: 'itviec', createdAt: at('2026-09-23T16:50:00Z') }),
      run({ id: 'y', portal: 'itviec', createdAt: at('2026-09-23T16:51:00Z') }),
    ]);
    expect(batches).toHaveLength(2);
  });

  test('lượt tài khoản tự chạy không bị gộp vào lượt của hệ thống', () => {
    const batches = groupBatches([
      run({ id: 's', portal: 'itviec' }),
      run({
        id: 'u',
        portal: 'topcv',
        userId: 'u1',
        userEmail: 'a@b.c',
        createdAt: at('2026-09-23T16:50:30Z'),
      }),
    ]);
    expect(batches.map((batch) => batch.manual)).toEqual([true, false]);
    expect(batches[0].userEmail).toBe('a@b.c');
  });

  test('đếm số portal hỏng trong lượt', () => {
    const [batch] = groupBatches([
      run({ id: '1', portal: 'itviec', status: 'FAILED', error: '403' }),
      run({ id: '2', portal: 'topcv' }),
    ]);
    expect(batch.failed).toBe(1);
  });
});

describe('portalStats', () => {
  const runs = [
    run({
      id: '3',
      portal: 'topcv',
      status: 'FAILED',
      createdAt: at('2026-09-23T16:50:00Z'),
    }),
    run({
      id: '2',
      portal: 'topcv',
      status: 'FAILED',
      createdAt: at('2026-09-22T16:50:00Z'),
    }),
    run({
      id: '1',
      portal: 'topcv',
      jobsNew: 7,
      jobsFound: 50,
      createdAt: at('2026-09-21T16:50:00Z'),
    }),
    run({ id: '0', portal: 'itviec' }),
  ];

  test('đếm chuỗi hỏng liên tiếp từ lượt mới nhất', () => {
    const stats = portalStats('topcv', runs, 50);
    expect(stats).toMatchObject({ runs: 3, failed: 2, failStreak: 2 });
    expect(stats.lastRun?.id).toBe('3');
  });

  test('lượt xong gần nhất đủ trần là chạm trần', () => {
    expect(portalStats('topcv', runs, 50).hitCap).toBe(true);
    expect(portalStats('topcv', runs, 60).hitCap).toBe(false);
  });

  test('chuỗi tin mới chỉ gồm lượt xong, cũ trước mới sau', () => {
    expect(portalStats('topcv', runs, 50).newSeries).toEqual([7]);
  });

  test('portal chưa từng chạy', () => {
    expect(portalStats('linkedin', runs, 50)).toMatchObject({
      runs: 0,
      lastRun: null,
      lastSuccessAt: null,
      hitCap: false,
    });
  });
});
