import { ExtMatchService } from 'src/modules/ext/match/ext-match.service';

function make(match: unknown) {
  const matching = { getMatch: jest.fn().mockResolvedValue(match) };
  const insights = {
    forJob: jest
      .fn()
      .mockResolvedValue({ market: { floor: 1 }, reposts: { count: 2 } }),
  };
  const service = new ExtMatchService(
    {} as never,
    matching as never,
    insights as never,
  );
  return { service, matching, insights };
}

describe('ExtMatchService.result', () => {
  it('match DONE → đính market + reposts từ insights', async () => {
    const { service, insights } = make({
      status: 'DONE',
      error: null,
      overallScore: 80,
    });

    const result = await service.result('user-1', 'job-1');

    expect(insights.forJob).toHaveBeenCalledWith('user-1', 'job-1');
    expect(result).toMatchObject({
      status: 'DONE',
      market: { floor: 1 },
      reposts: { count: 2 },
    });
  });

  it('match chưa DONE → không gọi insights, không đính gì thêm', async () => {
    const { service, insights } = make({ status: 'RUNNING', error: null });

    const result = await service.result('user-1', 'job-1');

    expect(insights.forJob).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('market');
    expect(result).not.toHaveProperty('reposts');
  });
});
