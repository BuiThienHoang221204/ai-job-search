import { AgentReviewService } from 'src/modules/agent/services/agent-review.service.js';
import type { AgentToolsService } from 'src/modules/agent/services/agent-tools.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import type { Storage } from 'src/modules/storage/storage.interface.js';

const RUN = {
  id: 'run-1',
  userId: 'nguoi-a',
  input: { jobDescription: 'Tuyển kế toán tổng hợp' },
  result: {
    artifacts: [
      {
        name: 'cv/main.tex',
        key: 'nguoi-a/agent_runs/run-1/cv/main.tex',
        bytes: 9,
      },
    ],
  },
  job: null,
};

const build = (
  options: {
    run?: unknown;
    runTools?: () => Promise<unknown>;
    readText?: (key: string) => Promise<string>;
  } = {},
) => {
  const update = jest.fn<Promise<unknown>, [unknown]>(() =>
    Promise.resolve({}),
  );
  const readText = jest.fn<Promise<string>, [string]>(
    options.readText ?? (() => Promise.resolve('noi dung CV')),
  );
  const runTools = jest.fn<Promise<unknown>, [unknown]>(
    options.runTools ??
      (() => Promise.resolve({ text: 'CV yếu ở phần số liệu', steps: [] })),
  );

  const service = new AgentReviewService(
    {
      agentRun: {
        findUnique: () => Promise.resolve('run' in options ? options.run : RUN),
        update,
      },
    } as unknown as PrismaService,
    { runTools } as unknown as AiService,
    {
      limits: () => ({ reviewerMaxSteps: 6, timeoutMs: 1000, search: {} }),
      reviewerDeps: () => ({ limits: { search: {} } }),
    } as unknown as AgentToolsService,
    { readText } as unknown as Storage,
  );

  return { service, update, readText, runTools };
};

type SaveCall = [{ data: { review: Record<string, unknown> } }];

const saved = (
  update: jest.Mock<Promise<unknown>, [unknown]>,
): Record<string, unknown> =>
  (update.mock.calls.at(-1) as unknown as SaveCall)[0].data.review;

describe('AgentReviewService.review', () => {
  it('đọc file đã lưu rồi ghi lại lời phản biện', async () => {
    const { service, update, readText } = build();

    await service.review('run-1');

    expect(readText).toHaveBeenCalledWith(
      'nguoi-a/agent_runs/run-1/cv/main.tex',
    );
    expect(saved(update)).toMatchObject({
      status: 'DONE',
      critique: 'CV yếu ở phần số liệu',
    });
  });

  it('bỏ qua artifact không thuộc thư mục của chính người dùng', async () => {
    const { service, readText } = build({
      run: {
        ...RUN,
        result: {
          artifacts: [
            {
              name: 'cv/main.tex',
              key: 'nguoi-b/agent_runs/x/cv/main.tex',
              bytes: 9,
            },
          ],
        },
      },
    });

    await service.review('run-1');

    expect(readText).not.toHaveBeenCalled();
  });

  it('không có tài liệu nào thì ghi FAILED chứ không gọi model', async () => {
    const { service, update, runTools } = build({
      run: { ...RUN, result: null },
    });

    await service.review('run-1');

    expect(runTools).not.toHaveBeenCalled();
    expect(saved(update)).toMatchObject({ status: 'FAILED' });
  });

  it('model hỏng thì ghi FAILED, không ném ra ngoài', async () => {
    const { service, update } = build({
      runTools: () => Promise.reject(new Error('hết hạn mức')),
    });

    await expect(service.review('run-1')).resolves.toBeUndefined();
    expect(saved(update)).toMatchObject({
      status: 'FAILED',
      error: 'hết hạn mức',
    });
  });

  it('lượt chạy không còn thì im lặng bỏ qua', async () => {
    const { service, update } = build({ run: null });

    await service.review('run-1');

    expect(update).not.toHaveBeenCalled();
  });
});
