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
      .send({ subOccupationCodes: [], preferredProvinces: [], ...body });

  const getProfile = () =>
    request(harness.server).get('/api/profile').set(auth());

  const updateProfile = (body: Record<string, unknown>) =>
    request(harness.server).put('/api/profile').set(auth()).send(body);

  test('ghi được occupationCode + nhiều nghề + experienceLevel, nghề trùng chỉ giữ một', async () => {
    await quickStart({
      occupationCode: 'IT',
      subOccupationCodes: ['IT_BACKEND', 'IT_FULLSTACK', 'IT_BACKEND'],
      experienceLevel: 'JUNIOR',
    }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as {
      occupationCode: string;
      subOccupationCodes: string[];
      experienceLevel: string;
    };
    expect(body.occupationCode).toBe('IT');
    expect(body.subOccupationCodes).toEqual(['IT_BACKEND', 'IT_FULLSTACK']);
    expect(body.experienceLevel).toBe('JUNIOR');
  });

  test('nghề không thuộc nhóm ngành đã chọn hoặc không có trong danh mục bị từ chối', async () => {
    await quickStart({
      occupationCode: 'IT',
      subOccupationCodes: ['IT_BACKEND', 'FIN_TAX'],
    }).expect(400);
    await quickStart({
      occupationCode: 'IT',
      subOccupationCodes: ['IT_OTHER'],
    }).expect(400);

    const response = await getProfile().expect(200);
    expect(
      (response.body as { subOccupationCodes: string[] }).subOccupationCodes,
    ).toEqual([]);
  });

  test('ghi được nơi làm việc, tỉnh trùng chỉ giữ một; mã tỉnh lạ bị từ chối', async () => {
    await quickStart({
      occupationCode: 'IT',
      preferredProvinces: ['HCM', 'DNA', 'HCM'],
    }).expect(200);
    await quickStart({
      occupationCode: 'IT',
      preferredProvinces: ['SAI_GON'],
    }).expect(400);

    const response = await getProfile().expect(200);
    expect(
      (response.body as { preferredProvinces: string[] }).preferredProvinces,
    ).toEqual(['HCM', 'DNA']);
  });

  test('lưu nơi ở khi chưa chọn nơi làm việc thì tự điền tỉnh; đã chọn rồi thì không đè', async () => {
    await updateProfile({ location: 'Gò Vấp, TP. Hồ Chí Minh' }).expect(200);
    const filled = await getProfile().expect(200);
    expect(
      (filled.body as { preferredProvinces: string[] }).preferredProvinces,
    ).toEqual(['HCM']);

    await updateProfile({ location: 'Cầu Giấy, Hà Nội' }).expect(200);
    const kept = await getProfile().expect(200);
    expect(
      (kept.body as { preferredProvinces: string[] }).preferredProvinces,
    ).toEqual(['HCM']);
  });

  test('thiếu danh sách nghề hoặc nơi làm việc bị từ chối; experienceLevel không bắt buộc', async () => {
    await request(harness.server)
      .post('/api/profile/quick-start')
      .set(auth())
      .send({ occupationCode: 'FINANCE' })
      .expect(400);
    await quickStart({ occupationCode: 'FINANCE' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as { occupationCode: string };
    expect(body.occupationCode).toBe('FINANCE');
  });

  test('occupationCode không có trong danh mục ngành bị từ chối', async () => {
    await quickStart({ occupationCode: 'KHONG_TON_TAI' }).expect(400);
    await quickStart({ occupationCode: 'IT_BACKEND' }).expect(400);

    const response = await getProfile().expect(200);
    expect(
      (response.body as { occupationCode: string | null }).occupationCode,
    ).not.toBe('KHONG_TON_TAI');
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
      subOccupationCodes: ['IT_BACKEND'],
    }).expect(200);

    await updateProfile({ phone: '0901234567' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as {
      occupationCode: string;
      subOccupationCodes: string[];
      phone: string;
    };
    expect(body.occupationCode).toBe('IT');
    expect(body.subOccupationCodes).toEqual(['IT_BACKEND']);
    expect(body.phone).toBe('0901234567');
  });

  test('PUT /profile với headline suy ra được NGÀNH THẬT thì ghi đè lựa chọn nhanh và bỏ các nghề của ngành cũ', async () => {
    await quickStart({
      occupationCode: 'IT',
      subOccupationCodes: ['IT_BACKEND'],
    }).expect(200);

    await updateProfile({ headline: 'Kế toán tổng hợp' }).expect(200);

    const response = await getProfile().expect(200);
    const body = response.body as {
      occupationCode: string;
      subOccupationCodes: string[];
    };
    expect(body.occupationCode).toBe('FINANCE');
    expect(body.subOccupationCodes).toEqual([]);
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
