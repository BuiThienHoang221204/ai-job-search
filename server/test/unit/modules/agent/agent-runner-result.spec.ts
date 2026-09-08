import { AgentRunnerService } from 'src/modules/agent/services/agent-runner.service.js';
import type { AgentContextService } from 'src/modules/agent/services/agent-context.service.js';
import type { AgentToolsService } from 'src/modules/agent/services/agent-tools.service.js';
import type { CommandRegistryService } from 'src/modules/agent/services/command-registry.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import type { AgentStepLog } from 'src/modules/ai/services/ai.types.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';

const RUN = {
  id: 'run-1',
  userId: 'nguoi-a',
  workflow: 'apply',
  jobId: null,
  input: {},
  messages: null,
  answer: null,
  startedAt: null,
};

const step = (index: number, text: string): AgentStepLog => ({
  index,
  text,
  toolCalls: [],
  toolResults: [],
  durationMs: 10,
  messages: [],
});

const build = () => {
  const updates: Record<string, unknown>[] = [];

  /*
   * Lời gọi Prisma là LƯỜI: `agentRun.update(...)` trả về một PrismaPromise
   * chưa chạy gì cả, và `$transaction` mới là chỗ nó thật sự ghi. Bản giả phải
   * lười y như vậy - bản đầu của test này ghi ngay lúc dựng mảng, nên nó xanh cả
   * khi lỗi còn nguyên.
   */
  const lazyUpdate = (data: Record<string, unknown>) => {
    let written = false;
    const write = () => {
      if (written) return;
      written = true;
      updates.push(data);
    };
    return {
      then: <T>(
        resolve: (value: unknown) => T,
        reject?: (reason: unknown) => T,
      ) => {
        write();
        return Promise.resolve({ ...RUN, ...data }).then(resolve, reject);
      },
    };
  };

  const prisma = {
    agentRun: {
      findUniqueOrThrow: () => Promise.resolve(RUN),
      update: (args: { data: Record<string, unknown> }) =>
        lazyUpdate(args.data),
    },
    agentStep: {
      findFirst: () => Promise.resolve(null),
      create: () => Promise.resolve({}),
    },
    $transaction: async (operations: unknown[]) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Promise.all(operations);
    },
  } as unknown as PrismaService;

  const ai = {
    runTools: (options: { onStep?: (log: AgentStepLog) => Promise<void> }) => {
      // Bắn-và-quên, đúng như `AiService` thật gọi `onStep`.
      void options.onStep?.(step(0, ''));
      void options.onStep?.(step(1, 'Câu kết luận của agent'));
      return Promise.resolve({
        text: 'Câu kết luận của agent',
        steps: [step(0, ''), step(1, 'Câu kết luận của agent')],
        finishReason: 'stop',
        modelId: 'mimo',
        messages: [],
      });
    },
  } as unknown as AiService;

  const service = new AgentRunnerService(
    prisma,
    ai,
    {
      get: () => Promise.resolve({ body: 'Step 1' }),
    } as unknown as CommandRegistryService,
    {
      limits: () => ({ maxSteps: 12, timeoutMs: 1000 }),
      references: () => [],
      build: () => ({ tools: {}, artifacts: [] }),
    } as unknown as AgentToolsService,
    { build: () => Promise.resolve('') } as unknown as AgentContextService,
  );

  return { service, updates };
};

describe('AgentRunnerService.run — ghi kết quả cuối', () => {
  it('lượt ghi bước chậm KHÔNG được xoá mất câu kết luận', async () => {
    const { service, updates } = build();

    await service.run('run-1');

    const last = updates.at(-1) as {
      status?: string;
      result?: { text?: string; finishReason?: string };
    };
    expect(last.status).toBe('DONE');
    expect(last.result?.text).toBe('Câu kết luận của agent');
    expect(last.result?.finishReason).toBe('stop');
  });

  it('không còn lượt ghi bước nào đáp xuống sau đó', async () => {
    const { service, updates } = build();

    await service.run('run-1');
    const soLuot = updates.length;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(updates).toHaveLength(soLuot);
  });
});
