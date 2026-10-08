import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

// Trọng tâm: PUT /profile bình thường không được phép âm thầm xoá occupationCode mà "Chọn nhanh" đã ghi tường minh.
describe('POST /api/profile/quick-start', () => {
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

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  const quickStart = (body: Record<string, unknown>) =>
    request(harness.server)
      .post('/api/profile/quick-start')
      .set(auth())
      .send(body);

  const getProfile = () =>
    request(harness.server).get('/api/profile').set(auth());

  const updateProfile = (body: Record<string, unknown>) =>
    request(harness.server).put('/api/profile').set(auth()).send(body);

  test('ghi được occupationCode + subOccupationCode + experienceLevel', async () => {
    await quickStart({
      occupationCode: 'IT',
      subOccupationCode: 'IT_BACKEND',
      experienceLevel: 'JUNIOR',
    }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as {
      occupationCode: string;
      subOccupationCode: string;
      experienceLevel: string;
    };
    expect(body.occupationCode).toBe('IT');
    expect(body.subOccupationCode).toBe('IT_BACKEND');
    expect(body.experienceLevel).toBe('JUNIOR');
  });

  test('chỉ occupationCode là bắt buộc', async () => {
    await quickStart({ occupationCode: 'FINANCE' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as { occupationCode: string };
    expect(body.occupationCode).toBe('FINANCE');
  });

  test('experienceLevel sai giá trị bị từ chối', async () => {
    await quickStart({
      occupationCode: 'IT',
      experienceLevel: 'KHONG_TON_TAI',
    }).expect(400);
  });

  // Bug Phương án A sửa: lưu hồ sơ bình thường không được xoá mất lựa chọn nhanh.
  test('PUT /profile sau đó KHÔNG xoá occupationCode đã chọn nhanh', async () => {
    await quickStart({
      occupationCode: 'IT',
      subOccupationCode: 'IT_BACKEND',
    }).expect(200);

    await updateProfile({ phone: '0901234567' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as {
      occupationCode: string;
      subOccupationCode: string;
      phone: string;
    };
    expect(body.occupationCode).toBe('IT');
    expect(body.subOccupationCode).toBe('IT_BACKEND');
    expect(body.phone).toBe('0901234567');
  });

  test('PUT /profile với headline suy ra được NGÀNH THẬT thì ghi đè lựa chọn nhanh', async () => {
    await quickStart({ occupationCode: 'IT' }).expect(200);

    await updateProfile({ headline: 'Kế toán tổng hợp' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as { occupationCode: string };
    expect(body.occupationCode).toBe('FINANCE');
  });

  test('PUT /profile với headline không khớp ngành nào (OTHER) thì vẫn giữ lựa chọn nhanh', async () => {
    await quickStart({ occupationCode: 'IT' }).expect(200);

    await updateProfile({ headline: 'Nghệ nhân gốm Bát Tràng' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as { occupationCode: string };
    expect(body.occupationCode).toBe('IT');
  });

  test('chọn nhanh một ngành khác với chức danh thì GIỮ lựa chọn, kể cả sau khi lưu trường khác', async () => {
    await updateProfile({ headline: 'Kế toán tổng hợp' }).expect(200);

    await quickStart({ occupationCode: 'IT' }).expect(200);
    await updateProfile({ expectedSalary: 30000000 }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as { occupationCode: string };
    expect(body.occupationCode).toBe('IT');
  });

  // Chỉ /profile/quick-start được phép ghi occupationCode - route hồ sơ thường thì không.
  test('PUT /profile gửi kèm occupationCode bị từ chối (whitelist)', async () => {
    await updateProfile({ occupationCode: 'IT' }).expect(400);
  });
});
