import type { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { InterviewTurnService } from 'src/modules/mock-interview/services/interview-turn.service.js';
import type { MockInterviewService } from 'src/modules/mock-interview/services/mock-interview.service.js';
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
  claims: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }>;
};

type BuildOptions = {
  run?: Record<string, unknown>;
  lastStep?: unknown;
  claimCount?: number;
  streamText?: () => Promise<unknown>;
};

const build = (pieces: string[], options: BuildOptions = {}) => {
  const written: Written = { steps: [], runs: [], claims: [] };
  let streamCalls = 0;

  const prisma = {
    agentRun: {
      create: () => Promise.resolve({ id: 'run-1' }),
      update: (args: { data: Record<string, unknown> }) => {
        written.runs.push(args.data);
        return Promise.resolve({});
      },
      updateMany: (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        written.claims.push(args);
        return Promise.resolve({ count: options.claimCount ?? 1 });
      },
    },
    agentStep: {
      count: () => Promise.resolve(1),
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
    streamText: () => {
      streamCalls += 1;
      if (options.streamText) return options.streamText();
      return Promise.resolve({ result: { textStream: textStream(pieces) } });
    },
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
    service: new InterviewTurnService(prisma, ai, sessions, {
      get: () => 20,
    } as unknown as ConfigService),
    written,
    streamCalls: () => streamCalls,
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
    expect(written.runs[0].result).toEqual({ text: 'Chúc bạn.' });
    expect(written.steps[0].toolCalls).toEqual([]);
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

describe('InterviewTurnService.stream — giành lượt chống gửi trùng', () => {
  it('giành lượt WAITING_USER → RUNNING khoá theo userId trước khi gọi model', async () => {
    const { service, written } = build(['TIẾP\nỔn.\n@@HOI@@\nTiếp?']);

    await collect(service.stream('u1', 'run-1', 'x'));

    expect(written.claims[0]).toEqual({
      where: { id: 'run-1', userId: 'u1', status: 'WAITING_USER' },
      data: { status: 'RUNNING' },
    });
    expect(written.runs.at(-1)?.status).toBe('WAITING_USER');
    expect(written.claims).toHaveLength(1);
  });

  it('lượt gửi thứ hai thua cuộc giành thì 400, không gọi model, không ghi bước', async () => {
    const { service, written, streamCalls } = build(['TIẾP\nx\n@@HOI@@\ny'], {
      claimCount: 0,
    });

    await expect(
      collect(service.stream('u1', 'run-1', 'x')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(streamCalls()).toBe(0);
    expect(written.steps).toHaveLength(0);
  });

  it('model ném lỗi trước khi stream thì trả lượt về WAITING_USER để bấm lại', async () => {
    const { service, written } = build([], {
      streamText: () => Promise.reject(new Error('429 rate limited')),
    });

    await expect(collect(service.stream('u1', 'run-1', 'x'))).rejects.toThrow(
      '429',
    );
    expect(written.claims.at(-1)).toEqual({
      where: { id: 'run-1', status: 'RUNNING' },
      data: { status: 'WAITING_USER' },
    });
  });

  it('model không trả câu hỏi thì cũng trả lượt về WAITING_USER', async () => {
    const { service, written } = build(['TIẾP\n']);

    await expect(
      collect(service.stream('u1', 'run-1', 'x')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(written.claims.at(-1)?.data).toEqual({ status: 'WAITING_USER' });
  });

  it('lượt bị ngắt giữa chừng (thiếu vạch ngăn, chưa HẾT) thì hỏng và trả lượt về, không ghi bước', async () => {
    const { service, written } = build([
      'TIẾP\nBạn đã nêu rõ cách áp dụng JWT, nhưng cần cụ thể hơn như ISO 2',
    ]);

    await expect(
      collect(service.stream('u1', 'run-1', 'x')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(written.steps).toHaveLength(0);
    expect(written.claims.at(-1)?.data).toEqual({ status: 'WAITING_USER' });
  });

  it('người đọc bỏ luồng giữa chừng thì vẫn trả lượt về', async () => {
    const { service, written } = build([
      'TIẾP\nNhận xét dài.\n@@HOI@@\nCâu hỏi?',
    ]);

    const stream = service.stream('u1', 'run-1', 'x');
    await stream.next();
    await stream.return(undefined);

    expect(written.claims.at(-1)?.data).toEqual({ status: 'WAITING_USER' });
    expect(written.steps).toHaveLength(0);
  });
});

describe('InterviewTurnService.openStream — model hỏng không để buổi kẹt RUNNING', () => {
  it('streamText ném sau khi tạo run thì run thành FAILED', async () => {
    const { service, written } = build([], {
      streamText: () => Promise.reject(new Error('503 upstream')),
    });

    await expect(service.openStream('u1', 'job-1')).rejects.toThrow('503');
    expect(written.runs.at(-1)).toEqual({
      status: 'FAILED',
      error: '503 upstream',
    });
  });
});
