import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Xác thực, phân quyền và cách ly dữ liệu giữa những người dùng khác nhau.
///
/// Đây là phần mà một lỗi im lặng gây hậu quả không thể hoàn lại: dữ liệu người
/// này lọt sang người khác thì không có cách nào lấy lại. Trước tệp này, toàn bộ
/// test của dự án đều là hàm thuần, nên chưa có gì chứng minh hai người dùng
/// thật sự không đọc được của nhau.
describe('Phân quyền và cách ly dữ liệu', () => {
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

  const get = (path: string, user?: TestUser) => {
    const call = request(harness.server).get(path);
    return user ? call.set('Authorization', `Bearer ${user.token}`) : call;
  };

  const post = (path: string, user?: TestUser) => {
    const call = request(harness.server).post(path);
    return user ? call.set('Authorization', `Bearer ${user.token}`) : call;
  };

  describe('chưa đăng nhập', () => {
    test.each([
      '/api/auth/me',
      '/api/profile',
      '/api/dashboard',
      '/api/documents',
      '/api/jobs',
      '/api/matches',
      '/api/applications',
      '/api/skills',
    ])('%s trả 401', async (path) => {
      await get(path).expect(401);
    });

    test('/api/admin/ai-health trả 401', async () => {
      await get('/api/admin/ai-health').expect(401);
    });
  });

  describe('đăng nhập nhưng không phải ADMIN', () => {
    /// `/api/skills` từng KHÔNG có guard nào - ai cũng gọi được, kể cả chưa đăng
    /// nhập. Nó để lộ tên và hash của khung prompt đang chạy, còn `reload` buộc
    /// máy chủ đọc lại đĩa. Cả hai là việc vận hành, không phải việc của ứng viên.
    test.each([
      ['GET', '/api/skills'],
      ['POST', '/api/skills/reload'],
      ['POST', '/api/scrape/portals/reload'],
      ['POST', '/api/admin/reconcile/run-now'],
    ])('%s %s trả 403', async (method, path) => {
      const user = await harness.signUp();
      const call = method === 'GET' ? get(path, user) : post(path, user);
      await call.expect(403);
    });

    test('/api/admin/ai-health trả 403', async () => {
      const user = await harness.signUp();
      await get('/api/admin/ai-health', user).expect(403);
    });

    /// Quét việc làm theo hồ sơ của chính mình là TÍNH NĂNG, không phải việc
    /// vận hành - nên route này cố ý mở cho người dùng thường. Nó cần rate limit,
    /// không cần chặn quyền. Test này giữ cho lần siết quyền sau không siết lầm.
    test('POST /api/scrape KHÔNG bị chặn theo vai trò', async () => {
      const user = await harness.signUp();
      const response = await post('/api/scrape', user).send({});
      expect(response.status).not.toBe(403);
    });
  });

  describe('ADMIN', () => {
    test('đọc được /api/skills', async () => {
      const admin = await harness.signUp();
      await harness.promoteToAdmin(admin.id);

      await get('/api/skills', admin).expect(200);
    });

    /// Vai trò được đọc tươi từ DB mỗi request, không lấy từ claim trong token.
    /// Nhờ vậy hạ quyền có hiệu lực ngay, không phải đợi token hết hạn.
    test('hạ quyền có hiệu lực ngay với token đang dùng', async () => {
      const user = await harness.signUp();
      await harness.promoteToAdmin(user.id);
      await get('/api/skills', user).expect(200);

      await harness.prisma.user.update({
        where: { id: user.id },
        data: { role: 'USER' },
      });

      await get('/api/skills', user).expect(403);
    });
  });

  describe('cách ly dữ liệu giữa hai người dùng', () => {
    /// Đây là lỗ hổng IDOR đã vá: `POST /api/documents/:id/generate-sync` tra
    /// tài liệu chỉ theo `id`, không kèm `userId`. Bất kỳ ai đăng nhập cũng
    /// regenerate được và NHẬN VỀ toàn bộ nội dung CV của người khác.
    const createCvFor = async (user: TestUser): Promise<string> => {
      const response = await post('/api/documents/cv', user)
        .send({})
        .expect(201);
      const body = response.body as { documentId: string };
      return body.documentId;
    };

    test('không đọc được tài liệu của người khác', async () => {
      const owner = await harness.signUp();
      const attacker = await harness.signUp();
      const documentId = await createCvFor(owner);

      await get(`/api/documents/${documentId}`, attacker).expect(404);
      await get(`/api/documents/${documentId}/source`, attacker).expect(404);
    });

    test('không sinh lại được tài liệu của người khác', async () => {
      const owner = await harness.signUp();
      const attacker = await harness.signUp();
      const documentId = await createCvFor(owner);

      await post(`/api/documents/${documentId}/generate-sync`, attacker).expect(
        404,
      );

      // Không một lời gọi model nào được xảy ra: chặn phải diễn ra TRƯỚC khi
      // tốn tiền, không phải sau.
      expect(harness.ai.calls).toHaveLength(0);
    });

    test('chủ sở hữu vẫn đọc được tài liệu của mình', async () => {
      const owner = await harness.signUp();
      const documentId = await createCvFor(owner);

      await get(`/api/documents/${documentId}`, owner).expect(200);
    });

    test('danh sách tài liệu chỉ chứa tài liệu của chính mình', async () => {
      const [first, second] = [await harness.signUp(), await harness.signUp()];
      await createCvFor(first);

      const response = await get('/api/documents', second).expect(200);
      expect(response.body).toEqual([]);
    });

    test('hồ sơ của mỗi người là riêng biệt', async () => {
      const first = await harness.signUp();
      const second = await harness.signUp();

      await request(harness.server)
        .put('/api/profile')
        .set('Authorization', `Bearer ${first.token}`)
        .send({ headline: 'Lập trình viên Fullstack' })
        .expect(200);

      const response = await get('/api/profile', second).expect(200);
      const body = response.body as { headline: string | null };
      expect(body.headline).toBeNull();
    });
  });

  describe('đường cookie', () => {
    /// Frontend thật dùng cookie httpOnly, không dùng Bearer. Phải có ít nhất
    /// một test đi đúng đường đó: nếu cookieParser bị bỏ khỏi bootstrap thì mọi
    /// test Bearer vẫn xanh trong khi web hỏng hoàn toàn.
    test('cookie aijob_token xác thực được', async () => {
      const user = await harness.signUp();

      const response = await request(harness.server)
        .get('/api/auth/me')
        .set('Cookie', user.cookie)
        .expect(200);

      const body = response.body as { id: string; role: string };
      expect(body.id).toBe(user.id);
      expect(body.role).toBe('USER');
    });
  });

  describe('đăng ký trùng', () => {
    /// Trước đây là mẫu kiểm-tra-rồi-tạo. Giờ để ràng buộc unique của DB phân
    /// xử và bắt P2002, nên vẫn 409 nhưng đúng cả khi hai request đồng thời.
    test('email đã tồn tại trả 409 chứ không phải 500', async () => {
      const user = await harness.signUp();

      await request(harness.server)
        .post('/api/auth/register')
        .send({
          email: user.email,
          name: 'Người khác',
          password: 'MatKhau12345',
        })
        .expect(409);
    });
  });
});
