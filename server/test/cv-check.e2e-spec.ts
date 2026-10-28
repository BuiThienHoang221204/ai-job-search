import request from 'supertest';
import { vnDay } from 'src/modules/cv-check/utils/guest.js';
import { createTestApp, type TestApp } from './support/app-harness.js';

const TEXT = [
  'Nguyễn Văn An · an@email.com · 0901 234 567',
  'KINH NGHIỆM',
  '• Xây dựng API thanh toán cho 2.000 cửa hàng',
  '• Tham gia tối ưu hệ thống',
  'HỌC VẤN',
  'Đại học Bách khoa',
  'KỸ NĂNG',
  'NestJS, PostgreSQL, Redis, Docker và nhiều công cụ khác trong công việc hằng ngày',
].join('\n');

const BODY = { text: TEXT, pages: 1, pagesRead: 1 };

const SEGMENTS = {
  sections: ['experience', 'education', 'skills'],
  bullets: [
    'Xây dựng API thanh toán cho 2.000 cửa hàng',
    'Tăng doanh thu 300% nhờ tối ưu toàn bộ hệ thống',
  ],
  summary: 'CV hợp vị trí Backend Developer mức Junior.',
  targetRole: 'Backend Developer',
  level: 'junior',
  review: [
    {
      section: 'experience',
      verdict: 'fix',
      note: 'Có dòng chưa nói kết quả.',
      issues: [
        {
          title: 'Dòng chưa nói bạn làm gì',
          impact: 'recruiter',
          why: 'Người đọc không biết bạn tối ưu cái gì.',
          quote: 'Tham gia tối ưu hệ thống',
          rewrite: 'Tối ưu truy vấn, giảm thời gian phản hồi 40%',
        },
      ],
    },
  ],
  ats: [{ key: 'headings', status: 'pass', note: 'Tên mục rõ.' }],
};

type CheckBody = {
  score: number;
  mode: 'ai' | 'quick';
  reason: string | null;
  review: {
    summary: string;
    sections: Array<{ issues: Array<{ rewrite: string | null }> }>;
  } | null;
  aiRemaining: number | null;
  checks: Array<{ key: string; detail: string }>;
};

describe('Chấm CV cho khách', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const check = (body: object = BODY) =>
    request(harness.server).post('/api/cv-check').send(body);

  const counters = () => harness.prisma.usageCounter.findMany();

  test('khách không token: AI tách dòng và nhận xét, bỏ dòng không có trong CV, code chấm điểm', async () => {
    harness.ai.willReturn(SEGMENTS);

    const response = await check().expect(200);
    const body = response.body as CheckBody;

    expect(body.mode).toBe('ai');
    expect(body.review?.summary).toBe(SEGMENTS.summary);
    expect(body.review?.sections[0].issues[0].rewrite).toBe(
      'Tối ưu truy vấn, giảm thời gian phản hồi [__]%',
    );
    expect(body.aiRemaining).toBe(3);
    expect(body.checks.find((item) => item.key === 'metrics')?.detail).toBe(
      '1/1 dòng kinh nghiệm có số liệu (nên từ một nửa trở lên).',
    );
    expect(harness.ai.calls[0].purpose).toBe('guest.cvCheck');
    expect(harness.ai.calls[0].userId).toBeUndefined();
  });

  test('hết 4 lượt của khách thì chấm nhanh không gọi AI và trả lại lượt tổng', async () => {
    for (let i = 0; i < 4; i++) harness.ai.willReturn(SEGMENTS);
    for (let i = 0; i < 4; i++) await check().expect(200);

    const response = await check().expect(200);

    expect(response.body as CheckBody).toMatchObject({
      mode: 'quick',
      reason: 'guest-limit',
      review: null,
    });
    expect(harness.ai.calls).toHaveLength(4);
    const total = (await counters()).find((row) => row.key === 'all');
    expect(total?.count).toBe(4);
  });

  test('hết trần tổng trong ngày thì không gọi AI và không tạo dòng cho khách', async () => {
    await harness.prisma.usageCounter.create({
      data: {
        scope: 'cv-check-total',
        key: 'all',
        day: new Date(vnDay(Date.now())),
        count: 50,
      },
    });

    const response = await check().expect(200);

    expect((response.body as CheckBody).reason).toBe('daily-limit');
    expect(harness.ai.calls).toHaveLength(0);
    expect(await counters()).toHaveLength(1);
  });

  test('hai request song song khi chỉ còn một lượt tổng thì chỉ một request được AI', async () => {
    await harness.prisma.usageCounter.create({
      data: {
        scope: 'cv-check-total',
        key: 'all',
        day: new Date(vnDay(Date.now())),
        count: 49,
      },
    });
    harness.ai.willReturn(SEGMENTS);

    const [first, second] = await Promise.all([check(), check()]);
    const modes = [first, second].map((r) => (r.body as CheckBody).mode).sort();

    expect(modes).toEqual(['ai', 'quick']);
    expect(harness.ai.calls).toHaveLength(1);
  });

  test('AI lỗi thì chấm nhanh và trả lại lượt đã giữ', async () => {
    harness.ai.willFail(new Error('gateway hết lượt'));

    const response = await check().expect(200);

    expect((response.body as CheckBody).reason).toBe('ai-failed');
    expect((await counters()).map((row) => row.count)).toEqual([0, 0]);
  });

  test('ảnh quét không có chữ thì không gọi AI', async () => {
    const response = await check({
      text: 'abc',
      pages: 1,
      pagesRead: 1,
    }).expect(200);

    expect((response.body as CheckBody).reason).toBe('no-text');
    expect(harness.ai.calls).toHaveLength(0);
  });

  test('chữ quá 40.000 ký tự bị từ chối', async () => {
    await check({ ...BODY, text: 'a'.repeat(40_001) }).expect(400);
  });
});
