import request from 'supertest';
import type { StreamTextResult } from 'src/modules/ai/ai.types.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

const MINUTE = 60_000;

const streamOf = (body: string): StreamTextResult =>
  ({
    textStream: (async function* () {
      await Promise.resolve();
      yield body;
    })(),
  }) as unknown as StreamTextResult;

describe('Phỏng vấn thử bằng giọng nói', () => {
  let harness: TestApp;
  let user: TestUser;
  let jobId: string;

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
        externalId: 'tin-giong-noi',
        url: 'https://example.test/tin-giong-noi',
        title: 'Lập trình viên Full Stack',
        company: 'Công ty Thử Nghiệm',
        description: 'Cần kinh nghiệm Vue.js và PostgreSQL.',
        tags: [],
      },
    });
    jobId = job.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const auth = (who: TestUser = user) => ({
    Authorization: `Bearer ${who.token}`,
  });

  const openVoice = () =>
    request(harness.server)
      .post('/api/mock-interviews/voice')
      .set(auth())
      .send({ jobId });

  const seedVoiceRun = (minutes: number, startedMinutesAgo: number) =>
    harness.prisma.agentRun.create({
      data: {
        userId: user.id,
        jobId,
        workflow: 'interview',
        status: 'DONE',
        startedAt: new Date(Date.now() - startedMinutesAgo * MINUTE),
        input: { mode: 'voice', minutes },
      },
    });

  const sendTurn = (runId: string, question: string, answer: string) =>
    request(harness.server)
      .post(`/api/mock-interviews/${runId}/voice-turns`)
      .set(auth())
      .send({ question, answer });

  test('mở buổi: cấp token khoá prompt có hồ sơ của tin, tạo buổi WAITING_USER chế độ giọng nói', async () => {
    const response = await openVoice().expect(201);
    const body = response.body as {
      runId: string;
      token: string;
      model: string;
    };

    expect(body.token).toBe('auth_tokens/gia-1');
    expect(body.model).toBe('gemini-3.8-live');
    const setup = harness.liveTokens.calls[0].setup;
    expect(JSON.stringify(setup.systemInstruction)).toContain(
      'Lập trình viên Full Stack',
    );

    const run = await harness.prisma.agentRun.findUniqueOrThrow({
      where: { id: body.runId },
    });
    expect(run.status).toBe('WAITING_USER');
    expect(run.input).toEqual({ mode: 'voice', minutes: 20, bonus: 0 });
    expect(JSON.stringify(run.messages)).toContain('GIỌNG NÓI');
  });

  test('còn ít hơn trọn một buổi trong hạn mức 24 giờ thì token chỉ sống tới hết phần còn lại', async () => {
    await seedVoiceRun(20, 25);

    await openVoice().expect(201);

    const minutesLeft =
      (harness.liveTokens.calls[0].expiresAt.getTime() - Date.now()) / MINUTE;
    expect(Math.round(minutesLeft)).toBe(10);
  });

  test('đã dùng hết hạn mức 24 giờ thì 400 và không cấp token', async () => {
    await seedVoiceRun(20, 25);
    await seedVoiceRun(9, 10);

    const response = await openVoice().expect(400);

    expect((response.body as { message: string }).message).toContain(
      '30 phút trong 24 giờ qua',
    );
    expect(harness.liveTokens.calls).toHaveLength(0);
  });

  test('hết hạn mức 24 giờ nhưng còn phút thưởng thì vẫn mở được, phần vượt ghi vào thưởng', async () => {
    await seedVoiceRun(20, 25);
    await seedVoiceRun(10, 11);
    await harness.prisma.user.update({
      where: { id: user.id },
      data: { bonusVoiceMinutes: 15 },
    });

    const { runId } = (await openVoice().expect(201)).body as {
      runId: string;
    };

    const run = await harness.prisma.agentRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(run.input).toMatchObject({ minutes: 15, bonus: 15 });
  });

  test('lưu lượt rồi kết thúc: câu trả lời gắn vào bước, lời tổng kết viết từ bản ghi giọng nói', async () => {
    const { runId } = (await openVoice()).body as { runId: string };
    await sendTurn(
      runId,
      'Bạn giới thiệu bản thân?',
      'Em làm Full Stack hai năm.',
    )
      .expect(201)
      .expect({ answered: 1 });
    await sendTurn(runId, 'Bạn đáp ứng Vue.js thế nào?', 'Em đã học Vue 3.')
      .expect(201)
      .expect({ answered: 2 });
    const streamText = jest.spyOn(harness.ai, 'streamText').mockResolvedValue({
      modelId: 'fake',
      result: streamOf(
        'HẾT\nCâu cuối ổn.\n@@HOI@@\nTổng kết: luyện thêm ví dụ Vue.',
      ),
    });

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/finish`)
      .set(auth())
      .expect(201);

    const run = await harness.prisma.agentRun.findUniqueOrThrow({
      where: { id: runId },
      include: { steps: { orderBy: { index: 'asc' } } },
    });
    expect(run.status).toBe('DONE');
    expect(run.result).toEqual({ text: 'Tổng kết: luyện thêm ví dụ Vue.' });
    expect(run.steps).toHaveLength(3);
    expect(run.steps[1].toolResults).toEqual([
      {
        tool: 'ask_user',
        output: {
          asked: 'Bạn đáp ứng Vue.js thế nào?',
          answer: 'Em đã học Vue 3.',
        },
      },
    ]);
    const sent = JSON.stringify(streamText.mock.calls[0][0].messages);
    expect(sent).toContain('GIỌNG NÓI');
    expect(sent).toContain('Em đã học Vue 3.');
  });

  test('hai lượt gửi cùng lúc: một 201, một 400, chỉ một bước', async () => {
    const { runId } = (await openVoice()).body as { runId: string };

    const statuses = await Promise.all([
      sendTurn(runId, 'Câu một?', 'Trả lời một.').then((r) => r.status),
      sendTurn(runId, 'Câu một?', 'Trả lời một.').then((r) => r.status),
    ]);

    expect(statuses.sort()).toEqual([201, 400]);
    expect(await harness.prisma.agentStep.count({ where: { runId } })).toBe(1);
  });

  test('đã đủ trần số câu thì 400 và buổi vẫn chờ kết thúc', async () => {
    const { runId } = (await openVoice()).body as { runId: string };
    await harness.prisma.agentStep.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        runId,
        index,
        text: '',
        toolCalls: [],
        toolResults: [],
        durationMs: 0,
      })),
    });

    await sendTurn(runId, 'Câu hai mốt?', 'Trả lời.').expect(400);

    const run = await harness.prisma.agentRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(run.status).toBe('WAITING_USER');
  });

  test('buổi của người khác trả 404', async () => {
    const { runId } = (await openVoice()).body as { runId: string };
    const other = await harness.signUp();

    await request(harness.server)
      .post(`/api/mock-interviews/${runId}/voice-turns`)
      .set(auth(other))
      .send({ question: 'Câu?', answer: 'Trả lời.' })
      .expect(404);
  });

  test('buổi luyện bằng chữ không nhận lượt giọng nói', async () => {
    const run = await harness.prisma.agentRun.create({
      data: {
        userId: user.id,
        jobId,
        workflow: 'interview',
        status: 'WAITING_USER',
        input: {},
        messages: [{ role: 'user', content: 'Bối cảnh' }],
      },
    });

    await sendTurn(run.id, 'Câu?', 'Trả lời.').expect(400);
  });
});
