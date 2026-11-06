import { ExtInsightsService } from 'src/modules/ext/insights/ext-insights.service';

describe('ExtInsightsService.forJob', () => {
  it('tái dùng JobsService.get, chỉ lấy salaryGuide + reposts', async () => {
    const jobs = {
      get: jest.fn().mockResolvedValue({
        salaryGuide: { floor: 5, ceiling: 9 },
        reposts: { count: 3 },
        overallScore: 80,
        other: 'bỏ qua',
      }),
    };
    const service = new ExtInsightsService(jobs as never);

    const result = await service.forJob('user-1', 'job-1');

    expect(jobs.get).toHaveBeenCalledWith('job-1', 'user-1');
    expect(result).toEqual({
      market: { floor: 5, ceiling: 9 },
      reposts: { count: 3 },
    });
  });
});
