import request from 'supertest';
import type { StreamTextResult } from 'src/modules/ai/ai.types.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

const NEXT_TURN = 'TIẾP\nTrả lời ổn.\n@@HOI@@\nBạn xử lý xung đột ra sao?';

const streamOf = (gate: Promise<void>, body: string): StreamTextResult =>
  ({
    textStream: (async function* () {
      await gate;
      yield body;
    })(),
  }) as unknown as StreamTextResult;

const waitFor = async (check: () => Promise<boolean>): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Hết giờ chờ điều kiện');
};

describe('POST /mock-interviews/:id/turn · giành lượt chống gửi trùng', () => {
  let harness: TestApp;
  let user: TestUser;
  let runId: string;
  let release = () => {};

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: 'tin-luot-phong-van',
        url: 'https://example.test/tin-luot-phong-van',
        title: 'Kế toán tổng hợp',
        company: 'Công ty Thử Nghiệm',
        description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
        tags: [],
      },
    });
    const run = await harness.prisma.agentRun.create({
      data: {
        userId: user.id,
        jobId: job.id,
        workflow: 'interview',
        status: 'WAITING_USER',
        question: 'Bạn giới thiệu bản thân?',
        input: {},
        messages: [
          { role: 'user', content: 'Bối cảnh phỏng vấn' },
          { role: 'assistant', content: 'Bạn giới thiệu bản thân?' },
        ],
        steps: {
          create: [
            {
              index: 0,
              text: '',
              toolCalls: [],
              toolResults: [],
              durationMs: 1,
            },
          ],
        },
      },
    });
    runId = run.id;
  });

  afterEach(() => {
    release();
    jest.restoreAllMocks();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  const statusOf = async () =>
    (
      await harness.prisma.agentRun.findUniqueOrThrow({
        where: { id: runId },
        select: { status: true },
      })
    ).status;

  test('gửi lần hai khi lượt đầu còn chạy thì 400, chỉ MỘT lượt model và MỘT bước mới', async () => {
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const streamText = jest
      .spyOn(harness.ai, 'streamText')
      .mockImplementation(() =>
        Promise.resolve({
          modelId: 'fake',
          result: streamOf(gate, NEXT_TURN),
        }),
      );

    const first = request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: 'Tôi là kế toán ba năm kinh nghiệm.' })
      .then((response) => response);

    await waitFor(async () => (await statusOf()) === 'RUNNING');

    const second = await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: 'Tôi là kế toán ba năm kinh nghiệm.' })
      .expect(400);
    expect((second.body as { message: string }).message).toContain(
      'đang được xử lý',
    );

    release();
    const done = await first;
    expect(done.status).toBe(201);
    expect(done.text).toContain('Bạn xử lý xung đột ra sao?');

    expect(streamText).toHaveBeenCalledTimes(1);
    expect(await harness.prisma.agentStep.count({ where: { runId } })).toBe(2);
    expect(await statusOf()).toBe('WAITING_USER');
  });

  test('hai lượt gửi CÙNG LÚC: đúng một 201 và một 400, không P2002, không bước trùng', async () => {
    const streamText = jest
      .spyOn(harness.ai, 'streamText')
      .mockImplementation(() =>
        Promise.resolve({
          modelId: 'fake',
          result: streamOf(Promise.resolve(), NEXT_TURN),
        }),
      );
    const send = () =>
      request(harness.server)
        .post(`/api/mock-interviews/${runId}/turn`)
        .set(auth())
        .send({ text: 'Tôi là kế toán ba năm kinh nghiệm.' })
        .then((response) => response.status);

    const statuses = await Promise.all([send(), send()]);

    expect(statuses.sort()).toEqual([201, 400]);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(await harness.prisma.agentStep.count({ where: { runId } })).toBe(2);
  });

  test('buổi đã xong trả 400 kèm thông báo, không phải 201 rồi cắt kết nối', async () => {
    await harness.prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'DONE' },
    });
    const streamText = jest.spyOn(harness.ai, 'streamText');

    const response = await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: 'Thêm một câu.' })
      .expect(400);

    expect((response.body as { message: string }).message).toContain(
      'không còn chờ câu trả lời',
    );
    expect(streamText).not.toHaveBeenCalled();
  });

  test('buổi của người khác trả 404', async () => {
    const other = await harness.signUp();

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set({ Authorization: `Bearer ${other.token}` })
      .send({ text: 'Xin chào.' })
      .expect(404);
    expect(await statusOf()).toBe('WAITING_USER');
  });

  test('xem lại buổi luyện trả NGUYÊN câu trả lời dài của người dùng', async () => {
    await harness.prisma.agentStep.updateMany({
      where: { runId },
      data: {
        toolResults: [
          { tool: 'ask_user', output: { asked: 'Bạn giới thiệu bản thân?' } },
        ],
      },
    });
    jest.spyOn(harness.ai, 'streamText').mockImplementation(() =>
      Promise.resolve({
        modelId: 'fake',
        result: streamOf(Promise.resolve(), NEXT_TURN),
      }),
    );
    const answer = 'Tôi phụ trách sổ sách. '.repeat(50);

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: answer })
      .expect(201);
    const detail = await request(harness.server)
      .get(`/api/mock-interviews/${runId}`)
      .set(auth())
      .expect(200);

    const steps = (
      detail.body as {
        steps: Array<{ toolResults: Array<{ output: { answer?: string } }> }>;
      }
    ).steps;
    expect(steps[0].toolResults[0].output.answer).toBe(answer);
  });

  test('model hỏng thì trả lượt về WAITING_USER và gửi lại được', async () => {
    jest
      .spyOn(harness.ai, 'streamText')
      .mockRejectedValueOnce(new Error('429 rate limited'))
      .mockImplementationOnce(() =>
        Promise.resolve({
          modelId: 'fake',
          result: streamOf(Promise.resolve(), NEXT_TURN),
        }),
      );

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: 'Câu trả lời.' })
      .expect((response) =>
        expect(response.status).toBeGreaterThanOrEqual(500),
      );
    expect(await statusOf()).toBe('WAITING_USER');

    const retry = await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: 'Câu trả lời.' })
      .expect(201);
    expect(retry.text).toContain('Bạn xử lý xung đột ra sao?');
    expect(await harness.prisma.agentStep.count({ where: { runId } })).toBe(2);
  });

  test('kết thúc sớm: đóng buổi, tổng kết vào result.text, câu đang hỏi dở không bị gắn câu trả lời', async () => {
    const streamText = jest
      .spyOn(harness.ai, 'streamText')
      .mockImplementation(() =>
        Promise.resolve({
          modelId: 'fake',
          result: streamOf(
            Promise.resolve(),
            'HẾT\nBạn trả lời chắc tay.\n@@HOI@@\nTổng kết: luyện thêm phần số liệu.',
          ),
        }),
      );

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/finish`)
      .set(auth())
      .expect(201);

    const run = await harness.prisma.agentRun.findUniqueOrThrow({
      where: { id: runId },
      include: { steps: { orderBy: { index: 'asc' } } },
    });
    expect(run.status).toBe('DONE');
    expect(run.result).toEqual({ text: 'Tổng kết: luyện thêm phần số liệu.' });
    expect(run.steps).toHaveLength(2);
    expect(run.steps[0].toolResults).toEqual([]);
    expect(run.steps[1].toolCalls).toEqual([]);
    expect(
      JSON.stringify(streamText.mock.calls[0][0].messages?.at(-1)),
    ).toContain('xin dừng');
  });

  test('tới trần số câu thì đóng buổi dù model vẫn muốn hỏi tiếp', async () => {
    await harness.prisma.agentStep.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        runId,
        index: index + 1,
        text: '',
        toolCalls: [],
        toolResults: [],
        durationMs: 1,
      })),
    });
    jest.spyOn(harness.ai, 'streamText').mockImplementation(() =>
      Promise.resolve({
        modelId: 'fake',
        result: streamOf(Promise.resolve(), NEXT_TURN),
      }),
    );

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/turn`)
      .set(auth())
      .send({ text: 'Câu trả lời thứ hai mươi.' })
      .expect(201);

    expect(await statusOf()).toBe('DONE');
  });
});
