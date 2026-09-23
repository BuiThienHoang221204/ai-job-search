import { BadRequestException } from '@nestjs/common';
import { InterviewTurnService } from 'src/modules/mock-interview/service/interview-turn.service.js';
import type { MockInterviewService } from 'src/modules/mock-interview/service/mock-interview.service.js';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';

const DOSSIER = '=== BỐI CẢNH ĐƠN ỨNG TUYỂN ===\nVị trí: Kế toán tổng hợp';

const textStream = (pieces: string[]): AsyncIterable<string> => ({
  async *[Symbol.asyncIterator]() {
    for (const piece of pieces) yield await Promise.resolve(piece);
  },
});

type Written = {
  steps: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
};

const build = (
  pieces: string[],
  options: { run?: Record<string, unknown>; lastStep?: unknown } = {},
) => {
  const written: Written = { steps: [], runs: [] };

  const prisma = {
    job: { findUnique: () => Promise.resolve({ id: 'job-1' }) },
    agentRun: {
      create: () => Promise.resolve({ id: 'run-1' }),
      update: (args: { data: Record<string, unknown> }) => {
        written.runs.push(args.data);
        return Promise.resolve({});
      },
    },
    agentStep: {
      findFirst: () => Promise.resolve(options.lastStep ?? null),
      create: (args: { data: Record<string, unknown> }) => {
        written.steps.push(args.data);
        return args.data;
      },
      update: (args: { data: Record<string, unknown> }) => args.data,
    },
    $transaction: (ops: unknown[]) => Promise.resolve(ops),
  } as unknown as PrismaService;

  const ai = {
    streamText: () =>
      Promise.resolve({ result: { textStream: textStream(pieces) } }),
  } as unknown as AiService;

  const sessions = {
    assertNoRunInFlight: () => Promise.resolve(),
    buildContext: () => Promise.resolve(DOSSIER),
    get: () =>
      Promise.resolve(
        options.run ?? {
          id: 'run-1',
          workflow: 'interview',
          status: 'WAITING_USER',
          messages: [{ role: 'user', content: DOSSIER }],
        },
      ),
  } as unknown as MockInterviewService;

  return {
    service: new InterviewTurnService(prisma, ai, sessions),
    written,
  };
};

const collect = async (stream: AsyncGenerator<string>): Promise<string> => {
  let out = '';
  for await (const piece of stream) out += piece;
  return out;
};

describe('InterviewTurnService.stream — dòng điều khiển không lọt ra màn hình', () => {
  it('cắt TIẾP ở dòng đầu, giữ nguyên phần còn lại', async () => {
    const { service } = build([
      'TIẾP\nNhận xét ngắn gọn.',
      '\n@@HOI@@\nBạn kể một tình huống khó?',
    ]);

    const out = await collect(service.stream('u1', 'run-1', 'Tôi từng...'));

    expect(out).not.toContain('TIẾP');
    expect(out).toContain('Nhận xét ngắn gọn.');
    expect(out).toContain('Bạn kể một tình huống khó?');
  });

  it('nhận cả TIEP không dấu', async () => {
    const { service, written } = build([
      'TIEP\nNhận xét.\n@@HOI@@\nCâu hỏi tiếp?',
    ]);

    await collect(service.stream('u1', 'run-1', 'x'));

    expect(written.runs[0].status).toBe('WAITING_USER');
  });

  it('HẾT thì đóng buổi', async () => {
    const { service, written } = build(['HẾT\nTổng kết.\n@@HOI@@\nChúc bạn.']);

    await collect(service.stream('u1', 'run-1', 'x'));

    expect(written.runs[0].status).toBe('DONE');
    expect(written.runs[0].question).toBeNull();
  });

  it('model quên dòng điều khiển thì coi như còn hỏi tiếp, không nuốt chữ', async () => {
    const { service, written } = build([
      'Nhận xét mở đầu.\n@@HOI@@\nCâu hỏi đây?',
    ]);

    const out = await collect(service.stream('u1', 'run-1', 'x'));

    expect(out).toContain('Nhận xét mở đầu.');
    expect(written.runs[0].status).toBe('WAITING_USER');
  });
});

describe('InterviewTurnService.stream — lọc giữa luồng', () => {
  it('vạch ngăn bị cắt đôi giữa hai mẩu vẫn không lọt ra', async () => {
    const { service } = build([
      'TIẾP\nNhận xét.\n@@H',
      'OI@@\nCâu hỏi tiếp theo là gì?',
    ]);

    const out = await collect(service.stream('u1', 'run-1', 'x'));

    expect(out).not.toContain('@@HOI@@');
    expect(out).not.toContain('@@H');
    expect(out).toContain('Câu hỏi tiếp theo là gì?');
  });

  it('khối tool_call model bịa ra không lọt ra màn hình', async () => {
    const { service } = build([
      'TIẾP\nNhận xét.<tool_call>',
      '{"name":"read_profile"}</tool_call>',
      '\n@@HOI@@\nCâu hỏi tiếp?',
    ]);

    const out = await collect(service.stream('u1', 'run-1', 'x'));

    expect(out).not.toContain('tool_call');
    expect(out).not.toContain('read_profile');
    expect(out).toContain('Câu hỏi tiếp?');
  });

  it('chữ ngoài bảng Latin bị xoá khỏi cả luồng lẫn bản lưu', async () => {
    const { service, written } = build([
      'TIẾP\nVí dụ:定义 PaymentService.\n@@HOI@@\nBạn làm thế nào?',
    ]);

    const out = await collect(service.stream('u1', 'run-1', 'x'));

    expect(out).not.toMatch(/[一-鿿]/);
    expect(JSON.stringify(written.steps[0])).not.toMatch(/[一-鿿]/);
  });
});

describe('InterviewTurnService.stream — ghi nhật ký', () => {
  it('nhận xét vào text, câu hỏi vào bước ask_user', async () => {
    const { service, written } = build([
      'TIẾP\nCâu trả lời rõ ràng.\n@@HOI@@\nBạn xử lý mâu thuẫn ra sao?',
    ]);

    await collect(service.stream('u1', 'run-1', 'x'));

    const step = written.steps[0];
    expect(step.text).toBe('Câu trả lời rõ ràng.');
    expect(JSON.stringify(step.toolCalls)).toContain(
      'Bạn xử lý mâu thuẫn ra sao?',
    );
  });

  it('gắn câu trả lời vào bước ask_user trước đó', async () => {
    const { service, written } = build(['TIẾP\nỔn.\n@@HOI@@\nTiếp theo?'], {
      lastStep: {
        id: 'step-0',
        index: 0,
        toolResults: [{ tool: 'ask_user', output: { asked: 'Câu đầu?' } }],
      },
    });

    await collect(service.stream('u1', 'run-1', 'Tôi trả lời thế này'));

    expect(written.steps[0].index).toBe(1);
  });

  it('model không trả về gì thì hỏng, không ghi bước rỗng', async () => {
    const { service, written } = build(['TIẾP\n']);

    await expect(
      collect(service.stream('u1', 'run-1', 'x')),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(written.steps).toHaveLength(0);
  });

  it('từ chối lượt chạy không phải buổi phỏng vấn', async () => {
    const { service } = build(['TIẾP\nx\n@@HOI@@\ny'], {
      run: { id: 'run-1', workflow: 'apply', status: 'WAITING_USER' },
    });

    await expect(
      collect(service.stream('u1', 'run-1', 'x')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối khi lượt chạy không chờ câu trả lời nào', async () => {
    const { service } = build(['TIẾP\nx\n@@HOI@@\ny'], {
      run: { id: 'run-1', workflow: 'interview', status: 'DONE' },
    });

    await expect(
      collect(service.stream('u1', 'run-1', 'x')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('InterviewTurnService.openStream — lượt đầu buổi', () => {
  it('giấu phần trước vạch ngăn, chỉ stream câu hỏi', async () => {
    const { service } = build([
      'TIẾP\nRất vui được gặp bạn hôm nay.\n@@HOI@@\nĐiều gì đưa bạn tới vị trí này?',
    ]);

    const opened = await service.openStream('u1', 'job-1');
    const out = await collect(opened.stream);

    expect(out).not.toContain('Rất vui được gặp bạn');
    expect(out).toContain('Điều gì đưa bạn tới vị trí này?');
  });

  it('bỏ hẳn phần nhận xét model bịa ra ở lượt đầu', async () => {
    const { service, written } = build([
      'TIẾP\nCâu trả lời của bạn rất tốt.\n@@HOI@@\nBạn tự giới thiệu nhé?',
    ]);

    const opened = await service.openStream('u1', 'job-1');
    await collect(opened.stream);

    expect(written.steps[0].text).toBe('');
  });

  it('vạch ngăn cắt đôi ở lượt đầu vẫn không lọt ra', async () => {
    const { service } = build([
      'TIẾP\nChào bạn.\n@@H',
      'OI@@\nBạn giới thiệu bản thân được không?',
    ]);

    const opened = await service.openStream('u1', 'job-1');
    const out = await collect(opened.stream);

    expect(out).not.toContain('@@');
    expect(out).not.toContain('Chào bạn.');
    expect(out).toContain('Bạn giới thiệu bản thân được không?');
  });

  it('lưu hội thoại gồm dossier và nguyên văn lượt của model', async () => {
    const { service, written } = build(['TIẾP\nx\n@@HOI@@\nCâu hỏi mở đầu?']);

    const opened = await service.openStream('u1', 'job-1');
    await collect(opened.stream);

    const messages = written.runs.at(-1)?.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0].content).toBe(DOSSIER);
    expect(messages[1].role).toBe('assistant');
  });
});
