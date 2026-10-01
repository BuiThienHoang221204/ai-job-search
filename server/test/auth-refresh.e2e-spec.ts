import request from 'supertest';
import {
  AUTH_COOKIE,
  REFRESH_COOKIE,
  SESSION_HINT_COOKIE,
} from 'src/modules/auth/auth.cookie.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

// Trọng tâm: hai điều mà chữ ký JWT không tự bảo đảm, nên hỏng thì hỏng im lặng.
// 1. Access/refresh ký cùng bí mật nên chữ ký đổi chỗ cho nhau được - chỉ claim `typ` ngăn refresh làm Bearer 7 ngày và ngăn access tự gia hạn vô thời hạn.
// 2. Một token hợp lệ chỉ chứng minh nó được ký, không chứng minh nó chưa bị rút lại - `tokenVersion` là chỗ duy nhất thu hồi, phải có hiệu lực với CẢ access đang còn hạn.
describe('Refresh token và thu hồi phiên', () => {
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

  const refresh = (cookie?: string) => {
    const call = request(harness.server).post('/api/auth/refresh');
    return cookie ? call.set('Cookie', cookie) : call;
  };

  const me = (bearer: string) =>
    request(harness.server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bearer}`);

  const login = (user: TestUser) =>
    request(harness.server)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

  // `set-cookie` của supertest là `any`, có thể là chuỗi/mảng/vắng mặt - thu hẹp bằng kiểm tra thật thay vì ép kiểu.
  const cookiesOf = (response: request.Response): string[] => {
    const raw: unknown = response.headers['set-cookie'];
    if (Array.isArray(raw)) {
      return raw.filter((value): value is string => typeof value === 'string');
    }
    return typeof raw === 'string' ? [raw] : [];
  };

  const cookieNamed = (response: request.Response, name: string) =>
    cookiesOf(response).find((value) => value.startsWith(`${name}=`));

  describe('đăng nhập', () => {
    let user: TestUser;

    beforeEach(async () => {
      user = await harness.signUp();
    });

    test('đặt đủ ba cookie', async () => {
      const response = await login(user).expect(200);

      expect(cookieNamed(response, AUTH_COOKIE)).toBeDefined();
      expect(cookieNamed(response, REFRESH_COOKIE)).toBeDefined();
      expect(cookieNamed(response, SESSION_HINT_COOKIE)).toBeDefined();
    });

    // Sai path thì trình duyệt lặng lẽ không gửi cookie ở lời gọi refresh - triệu chứng là "cứ 15 phút lại bị đăng xuất".
    test('cookie refresh bị giới hạn đúng path của route refresh', async () => {
      const response = await login(user).expect(200);

      expect(cookieNamed(response, REFRESH_COOKIE)).toContain(
        'Path=/api/auth/refresh',
      );
    });

    test('cookie gợi ý phiên KHÔNG httpOnly, hai cookie kia thì có', async () => {
      const response = await login(user).expect(200);

      expect(cookieNamed(response, SESSION_HINT_COOKIE)).not.toContain(
        'HttpOnly',
      );
      expect(cookieNamed(response, AUTH_COOKIE)).toContain('HttpOnly');
      expect(cookieNamed(response, REFRESH_COOKIE)).toContain('HttpOnly');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let user: TestUser;

    beforeEach(async () => {
      user = await harness.signUp();
    });

    test('cookie hợp lệ đổi được cặp token mới dùng được ngay', async () => {
      const response = await refresh(user.refreshCookie).expect(200);

      const body = response.body as { accessToken: string };
      expect(cookieNamed(response, AUTH_COOKIE)).toBeDefined();
      await me(body.accessToken).expect(200);
    });

    test('không có cookie trả 401', async () => {
      await refresh().expect(401);
    });

    test('cookie rác trả 401', async () => {
      await refresh(`${REFRESH_COOKIE}=khong-phai-jwt`).expect(401);
    });

    // Không có bước này thì ai nhặt được access token ở một dòng log cũng tự gia hạn được vô thời hạn.
    test('access token đem đổi lấy token mới trả 401', async () => {
      await refresh(`${REFRESH_COOKIE}=${user.token}`).expect(401);
    });
  });

  // Chiều ngược của cùng lỗ hổng: refresh token sống 7 ngày, gọi được API thường thì việc tách hai token vô nghĩa.
  test('refresh token dùng làm Bearer gọi API thường trả 401', async () => {
    const user = await harness.signUp();
    await me(user.refreshToken).expect(401);
  });

  describe('thu hồi bằng tokenVersion', () => {
    let user: TestUser;

    beforeEach(async () => {
      user = await harness.signUp();
    });

    const bumpVersion = () =>
      harness.prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });

    // Điều mà hệ thống một-token không làm được: access còn hạn nhưng chết ngay, không phải chờ hết 15 phút.
    test('access token đang còn hạn bị từ chối NGAY', async () => {
      await me(user.token).expect(200);
      await bumpVersion();
      await me(user.token).expect(401);
    });

    test('refresh token cũ không đổi được token mới', async () => {
      await refresh(user.refreshCookie).expect(200);
      await bumpVersion();
      await refresh(user.refreshCookie).expect(401);
    });

    test('đăng nhập lại sau khi thu hồi vẫn dùng được', async () => {
      await bumpVersion();

      const response = await login(user).expect(200);
      const body = response.body as { accessToken: string };
      await me(body.accessToken).expect(200);
    });
  });

  describe('đăng xuất', () => {
    let user: TestUser;

    beforeEach(async () => {
      user = await harness.signUp();
    });

    const logout = () =>
      request(harness.server)
        .post('/api/auth/logout')
        .set('Cookie', user.cookie);

    test('logout xoá cả ba cookie', async () => {
      const response = await logout().expect(200);

      for (const name of [AUTH_COOKIE, REFRESH_COOKIE, SESSION_HINT_COOKIE]) {
        expect(cookieNamed(response, name)).toBeDefined();
      }
    });

    test('logout xoá cookie refresh đúng path', async () => {
      const response = await logout().expect(200);

      expect(cookieNamed(response, REFRESH_COOKIE)).toContain(
        'Path=/api/auth/refresh',
      );
    });

    // `logout` chỉ chạm cookie của đúng trình duyệt gọi nó - phiên trên máy khác (refresh token đang giữ) phải còn sống.
    test('logout KHÔNG giết phiên trên thiết bị khác', async () => {
      await logout().expect(200);
      await refresh(user.refreshCookie).expect(200);
    });

    test('logout-all giết phiên trên MỌI thiết bị', async () => {
      await request(harness.server)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      await refresh(user.refreshCookie).expect(401);
      await me(user.token).expect(401);
    });

    test('logout-all đòi đăng nhập', async () => {
      await request(harness.server).post('/api/auth/logout-all').expect(401);
    });
  });
});
