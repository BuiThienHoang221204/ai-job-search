import request from 'supertest';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Vòng lặp agent: thi hành kịch bản trong `.claude/commands/`.
 *
 * Đây là tác vụ AI đầu tiên trong hệ thống mà **model điều khiển luồng** - nó
 * quyết định gọi tool nào và mấy lần, thay vì trả về một object theo schema
 * định sẵn. Vì vậy phép khẳng định đáng giá ở đây không phải "kết quả trông ra
 * sao" mà là:
 *
 * 1. Tool được gọi THẬT, và kết quả của chúng nằm lại trong `agent_steps` để
 *    người đọc lần được agent đã chệch ở bước nào.
 * 2. `ask_user` dừng vòng lặp và NHẢ worker ra - câu trả lời có thể tới sau vài
 *    giờ, ở một request khác, nên hội thoại phải sống trong database.
 * 3. Không ai đọc hay chạy tiếp được lượt chạy của người khác.
 */
describe('Agent chạy kịch bản nhiều bước', () => {
  let harness: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const JOB_DESCRIPTION =
    'Công ty TNHH Sáng Tạo tuyển Kế toán tổng hợp tại Hà Nội. Yêu cầu hai năm kinh nghiệm, thành thạo Excel và Misa, biết lập báo cáo tài chính.';

  const start = (body: Record<string, unknown> = {}) =>
    request(harness.server)
      .post('/api/agent-runs')
      .set(auth(user.token))
      .send({ workflow: 'apply', jobDescription: JOB_DESCRIPTION, ...body });

  test('chạy trọn kịch bản: gọi tool thật rồi ghi lại từng bước', async () => {
    harness.ai.willRunAgent({
      calls: [
        { tool: 'read_profile', input: {} },
        {
          tool: 'read_skill_reference',
          input: { file: '04-job-evaluation.md' },
        },
      ],
      text: 'Hồ sơ phù hợp trung bình với vị trí Kế toán tổng hợp.',
    });

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };

    await harness.queue.drain();

    const response = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const run = response.body as {
      status: string;
      result: { text: string };
      steps: Array<{
        index: number;
        toolCalls: Array<{ tool: string }>;
        toolResults: Array<{ output: unknown }>;
      }>;
    };

    expect(run.status).toBe('DONE');
    expect(run.result.text).toContain('Kế toán tổng hợp');

    // Hai tool đã chạy THẬT: bước đọc hồ sơ phải mang về tóm tắt hồ sơ, bước đọc
    // khung phải mang về nội dung file skill - không phải một chuỗi rỗng.
    expect(run.steps.map((step) => step.index)).toEqual([0, 1, 2]);
    expect(run.steps[0].toolCalls[0].tool).toBe('read_profile');
    expect(JSON.stringify(run.steps[0].toolResults)).toContain('summary');
    expect(run.steps[1].toolCalls[0].tool).toBe('read_skill_reference');
    expect(JSON.stringify(run.steps[1].toolResults).length).toBeGreaterThan(
      200,
    );
  });

  test('ask_user dừng lượt chạy và chờ câu trả lời', async () => {
    harness.ai.willRunAgent({
      calls: [
        {
          tool: 'ask_user',
          input: { question: 'Bạn có muốn tôi soạn CV cho vị trí này không?' },
        },
      ],
      text: '',
    });

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const waiting = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const run = waiting.body as { status: string; question: string };
    expect(run.status).toBe('WAITING_USER');
    expect(run.question).toContain('soạn CV');

    // Lượt chạy tiếp: câu trả lời đi vào hội thoại và các bước ĐÁNH SỐ NỐI vào
    // lượt trước, không bắt đầu lại từ 0 - khoá (runId, index) sẽ đụng nếu sai.
    harness.ai.willRunAgent({
      calls: [{ tool: 'read_profile', input: {} }],
      text: 'Đã soạn xong bản nháp.',
    });

    await request(harness.server)
      .post(`/api/agent-runs/${runId}/answer`)
      .set(auth(user.token))
      .send({ text: 'Có, soạn giúp tôi.' })
      .expect(201);

    await harness.queue.drain();

    const done = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const finished = done.body as {
      status: string;
      steps: Array<{ index: number }>;
    };
    expect(finished.status).toBe('DONE');
    expect(finished.steps.map((step) => step.index)).toEqual([0, 1, 2]);
  });

  /**
   * Ba tool này được thêm SAU lượt chạy thật đầu tiên, và mỗi cái sửa một lỗi
   * quan sát được: agent bịa URL để tải template, bị từ chối tên file có thư
   * mục, và không có đường nào để nhờ phản biện.
   */
  test('đọc được template LaTeX gốc, và chỉ trong hai thư mục cho phép', async () => {
    harness.ai.willRunAgent({
      calls: [
        { tool: 'read_template', input: { path: 'cv/main_example.tex' } },
        { tool: 'read_template', input: { path: '../.env' } },
      ],
      text: 'Đã đọc template.',
    });

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const run = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const steps = (run.body as { steps: Array<{ toolResults: unknown }> })
      .steps;
    expect(JSON.stringify(steps[0].toolResults)).toContain('documentclass');
    // Đường dẫn đi ra ngoài bị chặn, và bị chặn bằng một câu nói rõ lý do.
    expect(JSON.stringify(steps[1].toolResults)).toContain('cv/');
    expect(JSON.stringify(steps[1].toolResults)).toContain('error');
  });

  /**
   * Dặn bằng system prompt đã thử và KHÔNG ăn thua: một lượt chạy thật vẫn đọc
   * `03-writing-style.md` hai lần rồi lưu cùng một CV dưới hai cái tên, hết 15
   * giây và một prompt phình ra vài nghìn token. Nên chặn ở tool.
   */
  test('đọc lại một file thì chỉ nhận lời nhắc, không nhận lại nội dung', async () => {
    harness.ai.willRunAgent({
      calls: [
        {
          tool: 'read_skill_reference',
          input: { file: '03-writing-style.md' },
        },
        {
          tool: 'read_skill_reference',
          input: { file: '03-writing-style.md' },
        },
        { tool: 'read_profile', input: {} },
        { tool: 'read_profile', input: {} },
      ],
      text: 'Xong.',
    });

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const run = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const steps = (run.body as { steps: Array<{ toolResults: unknown }> })
      .steps;
    const output = (index: number) => JSON.stringify(steps[index].toolResults);

    // Lần đầu có nội dung thật; lần hai chỉ còn một câu nhắc.
    expect(output(0)).toContain('content');
    expect(output(1)).not.toContain('content');
    expect(output(1)).toContain('đã đọc file này');

    expect(output(2)).toContain('summary');
    expect(output(3)).not.toContain('summary');
    expect(output(3)).toContain('đã đọc hồ sơ');
  });

  test('lưu được file có một cấp thư mục, chặn đường dẫn đi ra ngoài', async () => {
    harness.ai.willRunAgent({
      calls: [
        {
          tool: 'save_artifact',
          input: { name: 'cv/main_abc.tex', content: 'documentclass moderncv' },
        },
        {
          tool: 'save_artifact',
          input: { name: '../../escape.tex', content: 'x' },
        },
      ],
      text: 'Đã lưu.',
    });

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const run = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const body = run.body as {
      result: { artifacts: Array<{ name: string }> };
      steps: Array<{ toolResults: unknown }>;
    };
    expect(body.result.artifacts.map((item) => item.name)).toEqual([
      'cv/main_abc.tex',
    ]);
    expect(JSON.stringify(body.steps[1].toolResults)).toContain('không hợp lệ');
  });

  test('spawn_reviewer chạy một agent CON và mang nhận xét về', async () => {
    // Kịch bản của agent chính, rồi tới kịch bản của agent con - FakeAi phát
    // theo đúng thứ tự này, nên nó cũng ghim luôn thứ tự gọi.
    harness.ai.willRunAgent(
      {
        calls: [
          {
            tool: 'spawn_reviewer',
            input: {
              company: 'Công ty Minh Long',
              role: 'Kế toán tổng hợp',
              jobPosting: JOB_DESCRIPTION,
              draft: 'Kính gửi quý công ty, tôi rất phù hợp.',
            },
          },
        ],
        text: 'Đã sửa theo nhận xét của người phản biện.',
      },
      {
        calls: [{ tool: 'read_profile', input: {} }],
        text: 'VẤN ĐỀ NGHIÊM TRỌNG: thư không nêu một con số nào.',
      },
    );

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const run = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const steps = (run.body as { steps: Array<{ toolResults: unknown }> })
      .steps;
    expect(JSON.stringify(steps[0].toolResults)).toContain(
      'VẤN ĐỀ NGHIÊM TRỌNG',
    );

    // Hai lượt gọi model riêng biệt, và lượt của reviewer mang purpose riêng để
    // `ai_calls` đo được nó tốn bao nhiêu.
    expect(harness.ai.calls.map((call) => call.purpose)).toEqual([
      'agent.apply',
      'agent.reviewer',
    ]);
  });

  /**
   * Một lượt hỏng giữa chừng KHÔNG được bắt người dùng dán lại mô tả công việc.
   *
   * Điểm khôi phục được ghi sau TỪNG bước, nên lượt chạy lại đi tiếp từ chỗ
   * dừng: các bước cũ nằm nguyên và số thứ tự nối vào, không bắt đầu lại từ 0.
   */
  test('chạy lại một lượt đã hỏng thì đi tiếp, không làm lại từ đầu', async () => {
    // Bước 0 chạy xong và ghi điểm khôi phục, rồi lượt chạy tiếp mới hỏng -
    // đúng hình dạng của lỗi hết giờ đã gặp trên máy thật.
    harness.ai.willRunAgent({
      calls: [{ tool: 'ask_user', input: { question: 'Tiếp chứ?' } }],
      text: '',
    });

    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    harness.ai.willFailAgent(
      new Error('The operation was aborted due to timeout'),
    );
    await request(harness.server)
      .post(`/api/agent-runs/${runId}/answer`)
      .set(auth(user.token))
      .send({ text: 'Có' })
      .expect(201);
    await harness.queue.drain();

    const failed = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);
    expect((failed.body as { status: string }).status).toBe('FAILED');

    harness.ai.willRunAgent({ text: 'Đã đi tiếp và hoàn tất.' });
    await request(harness.server)
      .post(`/api/agent-runs/${runId}/retry`)
      .set(auth(user.token))
      .expect(201);
    await harness.queue.drain();

    const after = await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(user.token))
      .expect(200);

    const record = after.body as {
      status: string;
      steps: Array<{ index: number }>;
    };
    expect(record.status).toBe('DONE');
    // Bước cũ còn nguyên và bước mới NỐI vào, không đè lên và không bắt đầu
    // lại từ 0 - tức là nó đi tiếp chứ không làm lại.
    expect(record.steps.map((step) => step.index)).toEqual([0, 1]);

    // Và lượt chạy tiếp nhận được hội thoại cũ, không phải prompt mở đầu.
    const last = harness.ai.calls.at(-1);
    expect(last?.prompt).toContain('Tiếp chứ?');
  });

  test('không chạy lại được lượt chưa hỏng', async () => {
    harness.ai.willRunAgent({ text: 'Xong.' });
    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const response = await request(harness.server)
      .post(`/api/agent-runs/${runId}/retry`)
      .set(auth(user.token))
      .expect(400);
    expect((response.body as { message: string }).message).toMatch(/DONE/);
  });

  test('không chạy lại được lượt của người khác', async () => {
    harness.ai.willFailAgent(new Error('hỏng'));
    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const other = await harness.signUp();
    await request(harness.server)
      .post(`/api/agent-runs/${runId}/retry`)
      .set(auth(other.token))
      .expect(404);
  });

  test('không trả lời được lượt chạy chưa hỏi gì', async () => {
    harness.ai.willRunAgent({ text: 'Xong.' });
    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const response = await request(harness.server)
      .post(`/api/agent-runs/${runId}/answer`)
      .set(auth(user.token))
      .send({ text: 'Có' })
      .expect(400);

    expect((response.body as { message: string }).message).toMatch(/DONE/);
  });

  /**
   * Hạn ngạch, không phải sự cẩn thận thừa: một lượt tiêu 10-20 lời gọi model,
   * mà hạn mức gateway tính theo model và DÙNG CHUNG cho cả hệ thống. Một người
   * bấm năm lần là năm lượt cùng chạy, cạn hạn mức, và mọi người dùng khác nhận
   * lỗi UPSTREAM cho tới khi hết giờ phạt.
   */
  test('mỗi người chỉ được một lượt đang chạy', async () => {
    await start().expect(201);

    const second = await start().expect(409);
    expect((second.body as { message: string }).message).toMatch(/chưa xong/);

    // Người khác KHÔNG bị chặn theo.
    const other = await harness.signUp();
    await request(harness.server)
      .post('/api/agent-runs')
      .set(auth(other.token))
      .send({ workflow: 'apply', jobDescription: JOB_DESCRIPTION })
      .expect(201);
  });

  test('lượt đang CHỜ TRẢ LỜI không chặn lượt mới', async () => {
    harness.ai.willRunAgent({
      calls: [{ tool: 'ask_user', input: { question: 'Tiếp chứ?' } }],
      text: '',
    });
    await start().expect(201);
    await harness.queue.drain();

    // Lượt kia đang chờ người, không tiêu gì cả - chặn nó là chặn nhầm.
    harness.ai.willRunAgent({ text: 'Xong.' });
    await start().expect(201);
  });

  test('kịch bản không tồn tại thì báo 404 ngay, không tạo bản ghi', async () => {
    await start({ workflow: 'khong-co-that' }).expect(404);
    expect(await harness.prisma.agentRun.count()).toBe(0);
    expect(harness.queue.sentTo(QUEUE.AGENT_RUN)).toHaveLength(0);
  });

  test('không có JD lẫn URL thì bị từ chối', async () => {
    await request(harness.server)
      .post('/api/agent-runs')
      .set(auth(user.token))
      .send({ workflow: 'apply' })
      .expect(400);
  });

  test('không đọc và không chạy tiếp được lượt chạy của người khác', async () => {
    harness.ai.willRunAgent({
      calls: [{ tool: 'ask_user', input: { question: 'Tiếp tục chứ?' } }],
      text: '',
    });
    const created = await start().expect(201);
    const { runId } = created.body as { runId: string };
    await harness.queue.drain();

    const other = await harness.signUp();

    await request(harness.server)
      .get(`/api/agent-runs/${runId}`)
      .set(auth(other.token))
      .expect(404);

    await request(harness.server)
      .post(`/api/agent-runs/${runId}/answer`)
      .set(auth(other.token))
      .send({ text: 'Có' })
      .expect(404);
  });

  test('liệt kê được các kịch bản đang có', async () => {
    const response = await request(harness.server)
      .get('/api/agent-runs/workflows')
      .set(auth(user.token))
      .expect(200);

    expect(response.body as string[]).toContain('apply');
  });
});
