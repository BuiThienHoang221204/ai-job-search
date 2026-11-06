import { ExtLookupService } from 'src/modules/ext/lookup/ext-lookup.service';

function make(match: unknown) {
  const extJobs = {
    findJobIdByUrl: jest.fn().mockResolvedValue(match ? 'job-1' : null),
  };
  const matching = { findMatch: jest.fn().mockResolvedValue(match) };
  const upskill = { gapsForJob: jest.fn().mockResolvedValue(null) };
  const companies = { forCompany: jest.fn().mockResolvedValue(null) };
  const insights = {
    forJob: jest
      .fn()
      .mockResolvedValue({ market: { floor: 1 }, reposts: { count: 2 } }),
  };
  const service = new ExtLookupService(
    extJobs as never,
    matching as never,
    upskill as never,
    companies as never,
    insights as never,
  );
  return { service, insights };
}

describe('ExtLookupService.lookup', () => {
  it('match DONE → đính market + reposts (auto-hiện khớp web)', async () => {
    const { service, insights } = make({
      status: 'DONE',
      error: null,
      overallScore: 70,
    });

    const result = await service.lookup('user-1', {
      url: 'https://x.com/job',
    });

    expect(insights.forJob).toHaveBeenCalledWith('user-1', 'job-1');
    expect(result.match).toMatchObject({
      status: 'DONE',
      market: { floor: 1 },
      reposts: { count: 2 },
    });
  });

  it('chưa soi (match null) → không gọi insights, match null', async () => {
    const { service, insights } = make(null);

    const result = await service.lookup('user-1', {
      url: 'https://x.com/job',
    });

    expect(insights.forJob).not.toHaveBeenCalled();
    expect(result.match).toBeNull();
  });

  it('match chưa DONE → không đính insights', async () => {
    const { service, insights } = make({ status: 'RUNNING', error: null });

    const result = await service.lookup('user-1', {
      url: 'https://x.com/job',
    });

    expect(insights.forJob).not.toHaveBeenCalled();
    expect(result.match).toMatchObject({ status: 'RUNNING' });
  });
});
