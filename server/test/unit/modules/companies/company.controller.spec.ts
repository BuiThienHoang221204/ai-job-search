import { CompanyController } from 'src/modules/companies/company.controller.js';
import type { CompanyService } from 'src/modules/companies/company.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import type { QueueService } from 'src/modules/queue/queue.service.js';

function build(plan: unknown) {
  const sent: Array<{ queue: string; data: unknown }> = [];
  const queue = {
    send: (name: string, data: unknown) => {
      sent.push({ queue: name, data });
      return Promise.resolve();
    },
  } as unknown as QueueService;

  const companies = {
    forJob: () =>
      Promise.resolve({
        company: 'FPT Software',
        researchable: true,
        brief: null,
        stale: false,
      }),
    planRefresh: () => Promise.resolve(plan),
  } as unknown as CompanyService;

  return { controller: new CompanyController(companies, queue), sent };
}

describe('CompanyController', () => {
  test('đường đọc trả thẳng bản đã lưu, không xếp việc nào', async () => {
    const { controller, sent } = build(null);

    const view = await controller.brief('job-1');

    expect(view.company).toBe('FPT Software');
    expect(sent).toEqual([]);
  });

  test('bản còn hạn thì KHÔNG xếp việc - không tốn lượt gọi model', async () => {
    const { controller, sent } = build(null);

    expect(await controller.refresh('job-1', {})).toMatchObject({
      queued: false,
    });
    expect(sent).toEqual([]);
  });

  test('cần làm mới thì xếp đúng hàng đợi với payload đã chuẩn hoá', async () => {
    const payload = {
      nameKey: 'fpt software',
      company: 'FPT Software',
      force: true,
    };
    const { controller, sent } = build(payload);

    expect(await controller.refresh('job-1', { force: true })).toMatchObject({
      queued: true,
    });
    expect(sent).toEqual([{ queue: QUEUE.COMPANY_BRIEF, data: payload }]);
  });
});
