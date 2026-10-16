import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Trần thân request của `express.json` phải lớn hơn trần của DTO lớn nhất.
/// Mặc định 100kb của body-parser nhỏ hơn: một mô tả công việc 60.000 ký tự
/// tiếng Việt là ~180KB UTF-8, và người dùng nhận 413 trước khi ValidationPipe
/// kịp nói gì.
describe('Trần kích thước thân request', () => {
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

  const skillList = (seed: string) =>
    Array.from({ length: 60 }, (_, i) => `${seed} ${i} `.padEnd(200, 'ệ'));

  test('hồ sơ sát trần DTO (vượt xa 100kb) vẫn được nhận', async () => {
    const body = {
      summary: 'Tóm tắt '.padEnd(4_000, 'ữ'),
      workPermitNote: 'Ghi chú '.padEnd(4_000, 'ữ'),
      commuteConstraint: 'Đi lại '.padEnd(4_000, 'ữ'),
      primarySkills: skillList('Kỹ năng chính'),
      secondarySkills: skillList('Kỹ năng phụ'),
      languages: skillList('Ngôn ngữ'),
      directExperienceDomains: skillList('Lĩnh vực'),
      adjacentExperience: skillList('Liền kề'),
      careerGoals: skillList('Mục tiêu'),
    };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(200 * 1024);

    const response = await request(harness.server)
      .put('/api/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send(body);

    expect(response.status).toBe(200);
  });

  test('thân request quá trần thì 413', async () => {
    const response = await request(harness.server)
      .put('/api/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ summary: 'x'.repeat(1_100_000) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ statusCode: 413 });
  });

  test('JSON hỏng thì 400, không phải 500', async () => {
    const response = await request(harness.server)
      .put('/api/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Content-Type', 'application/json')
      .send('{"summary": ');

    expect(response.status).toBe(400);
  });
});
