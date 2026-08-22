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

/// Vòng đời token: đổi refresh lấy access mới, và thu hồi.
///
/// Trọng tâm của tệp này là hai thứ mà chữ ký JWT KHÔNG tự bảo đảm, nên nếu
/// hỏng thì hỏng im lặng:
///
/// 1. Access và refresh token ký bằng cùng một bí mật, nên chữ ký của chúng đổi
///    chỗ cho nhau được. Chỉ mỗi claim `typ` ngăn refresh token thành một Bearer
///    sống 7 ngày, và ngăn access token tự gia hạn vô thời hạn. Mất bước kiểm đó
///    thì mọi test khác vẫn xanh.
/// 2. Một token hợp lệ chỉ chứng minh nó được ký, không chứng minh nó chưa bị
///    rút lại. `tokenVersion` là chỗ duy nhất thu hồi được, và nó phải có hiệu
///    lực với CẢ access token đang còn hạn chứ không riêng refresh.
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

  /// `set-cookie` của supertest là `any` và có thể là chuỗi, mảng, hoặc vắng
  /// mặt. Thu hẹp bằng kiểm tra thật để test đỏ chỉ đúng chỗ sai, thay vì ném
  /// "cannot read property of undefined".
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

    /// Sai path thì trình duyệt LẶNG LẼ không gửi cookie ở lời gọi refresh, và
    /// triệu chứng là "cứ 15 phút lại bị đăng xuất" - rất khó lần ra từ đó.
    test('cookie refresh bị giới hạn đúng path của route refresh', async () => {
      const response = await login(user).expect(200);

      expect(cookieNamed(response, REFRESH_COOKIE)).toContain(
        'Path=/api/auth/refresh',
      );
    });

    /// Cookie gợi ý phiên sinh ra để middleware của Next đọc được; httpOnly thì
    /// nó vô dụng. Hai cookie kia thì ngược lại, mất httpOnly là mất toàn bộ
    /// phòng thủ trước XSS.
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

    /// Không có bước này thì ai nhặt được access token ở một dòng log cũng tự
    /// gia hạn được vô thời hạn, và việc rút access xuống 15 phút thành vô
    /// nghĩa. Chữ ký của access token hợp lệ ở đây, nên CHỈ claim `typ` chặn.
    test('access token đem đổi lấy token mới trả 401', async () => {
      await refresh(`${REFRESH_COOKIE}=${user.token}`).expect(401);
    });
  });

  /// Chiều ngược lại của cùng một lỗ hổng: refresh token sống 7 ngày, nên nếu
  /// nó gọi được API thường thì việc tách hai token không còn tác dụng gì.
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

    /// Điều mà hệ thống một-token KHÔNG làm được: access token vẫn còn hạn
    /// nhưng chết ngay, không phải chờ hết 15 phút.
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

    /// Xoá cookie phải truyền lại ĐÚNG path lúc tạo, nếu không trình duyệt coi
    /// đó là một cookie khác và cookie refresh cũ vẫn nằm nguyên đó.
    test('logout xoá cookie refresh đúng path', async () => {
      const response = await logout().expect(200);

      expect(cookieNamed(response, REFRESH_COOKIE)).toContain(
        'Path=/api/auth/refresh',
      );
    });

    /// `logout` chỉ chạm cookie của đúng trình duyệt gọi nó, nên phiên trên máy
    /// khác - ở đây là refresh token đang giữ - phải còn sống. Đây là ranh giới
    /// tách `logout` khỏi `logout-all`.
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
