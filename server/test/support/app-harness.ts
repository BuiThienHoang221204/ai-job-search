import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from 'src/app.module.js';
import { configureApp } from 'src/bootstrap.js';
import { AiService } from 'src/modules/ai/ai.service.js';
import { AUTH_COOKIE } from 'src/modules/auth/auth.cookie.js';
import { QueueService } from 'src/modules/queue/queue.service.js';
import { PrismaService } from 'src/prisma/prisma.service.js';
import { SANDBOX } from 'src/modules/sandbox/sandbox.interface.js';
import { FakeSandbox } from 'src/testing/fake-sandbox.js';
import { FakeAi } from 'src/testing/fake-ai.js';
import { FakeQueue } from './fake-queue.js';
import { truncateAll } from './test-database.js';

/// Đếm toàn cục để email không đụng nhau trong cùng một lượt chạy. Không dùng
/// số ngẫu nhiên: khi test đỏ, một email tái lập được là thứ giúp dò lại.
let userCounter = 0;

const TEST_PASSWORD = 'MatKhauTest123!';

export type TestUser = {
  id: string;
  email: string;
  password: string;
  /// Bearer token. Đường mà `auth.controller.ts` khuyên dùng cho test.
  token: string;
  /// Cặp `aijob_token=...` để gắn vào header Cookie. Giữ lại vì đây là đường
  /// frontend thật đi, và nó là đường có rủi ro bảo mật cao hơn - phải có ít
  /// nhất một test đi qua nó chứ không chỉ test đường Bearer.
  cookie: string;
};

export type TestApp = {
  app: INestApplication;
  server: Server;
  prisma: PrismaService;
  ai: FakeAi;
  queue: FakeQueue;
  /// SEAM 2. Thay để KHÔNG test nào chạm Docker: một lượt `docker run` mất 5-10
  /// giây, cần ảnh nhiều GB, và cần mạng ở đường Assisted Apply.
  sandbox: FakeSandbox;
  /// Tạo người dùng thật qua HTTP `POST /api/auth/register`.
  ///
  /// Cố ý đi qua HTTP chứ không `prisma.user.create` trực tiếp: đường đăng ký
  /// thật còn băm mật khẩu và tạo sẵn Profile rỗng, và test cần đúng trạng thái
  /// đó chứ không phải một hàng dữ liệu tự dựng.
  signUp(email?: string): Promise<TestUser>;
  /// Nâng quyền ADMIN. Đi thẳng vào DB vì hệ thống CỐ Ý không có route nào làm
  /// việc này - nâng quyền là một câu SQL do người vận hành chạy.
  promoteToAdmin(userId: string): Promise<void>;
  /// Xoá sạch dữ liệu và trạng thái của các bản giả. Gọi trong `beforeEach`.
  reset(): Promise<void>;
  close(): Promise<void>;
};

/// Dựng app thật trên database test, với AI và hàng đợi là bản giả.
///
/// Ba thứ được thay và lý do:
///
/// - `AiService` -> `FakeAi`: không gọi mạng, không tốn tiền, và kết quả model
///   trở thành dữ liệu xếp sẵn nên test khẳng định được nhánh nghiệp vụ.
/// - `QueueService` -> `FakeQueue`: bản thật khởi động pg-boss và đăng ký worker
///   ngay lúc module init. `FakeQueue.drain()` thay thời gian chờ bằng một lời
///   gọi xác định.
/// - `SANDBOX` -> `FakeSandbox`: bản thật gọi `docker run`. Riêng đường Assisted
///   Apply còn cần MẠNG và một trang web thật, nên để bản thật ở đây thì bộ e2e
///   phụ thuộc vào việc trang của người khác có sống hay không.
/// - Cron quét portal: tắt bằng biến môi trường trong `e2e-env.ts`.
///
/// Những thứ KHÔNG thay: Postgres (thật, database riêng), toàn bộ guard, filter,
/// middleware, ValidationPipe và LocalStorage. Đó mới là phần cần được kiểm
/// chứng - thay chúng bằng bản giả thì test không còn nói được gì về production.
export type TestAppOptions = {
  /**
   * Bật rate limiting thật. Mặc định TẮT.
   *
   * Phải tắt theo mặc định vì gần như mọi test đều gọi `signUp`, và trần
   * `ThrottleAuth` là 10 lần/phút — bật lên thì hàng chục test sẽ đỏ vì 429 chứ
   * không phải vì thứ chúng đang kiểm. Đổi lại, `throttle.e2e-spec.ts` bật nó
   * lên để chứng minh cơ chế thật sự chạy; không có spec đó thì việc tắt ở đây
   * biến thành "chưa bao giờ kiểm".
   */
  throttle?: boolean;
};

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const ai = new FakeAi();
  const queue = new FakeQueue();
  const sandbox = new FakeSandbox();

  // Đặt TRƯỚC khi compile: `ConfigModule` đọc biến môi trường lúc dựng module,
  // nên đổi sau đó thì không có tác dụng. Không dùng `overrideGuard` được -
  // ThrottlerGuard đăng ký qua token APP_GUARD, ngoài tầm với của nó.
  process.env.THROTTLE_DISABLED = options.throttle ? 'false' : 'true';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiService)
    .useValue(ai)
    .overrideProvider(QueueService)
    .useValue(queue)
    .overrideProvider(SANDBOX)
    .useValue(sandbox)
    .compile();

  const app = moduleRef.createNestApplication();
  // Đúng cấu hình HTTP của máy chủ thật, không phải một bản dựng lại gần giống.
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const server = app.getHttpServer() as Server;

  const signUp = async (email?: string): Promise<TestUser> => {
    userCounter += 1;
    const address = email ?? `nguoi-dung-${userCounter}@test.local`;

    const response = await request(server)
      .post('/api/auth/register')
      .send({
        email: address,
        name: `Người dùng ${userCounter}`,
        password: TEST_PASSWORD,
      });

    if (response.status !== 201) {
      throw new Error(
        `Đăng ký thất bại (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    // `response.body` của supertest là `any`; khai kiểu ngay tại đây để phần
    // còn lại của hàm không phải làm việc với any.
    const body = response.body as {
      accessToken: string;
      user: { id: string };
    };

    // `response.headers` của supertest là `any`. Đưa qua `unknown` rồi thu hẹp
    // bằng kiểm tra thật, thay vì ép kiểu: set-cookie có thể là chuỗi, mảng
    // chuỗi, hoặc vắng mặt, và nếu đoán sai thì thông báo lỗi sẽ là
    // "cannot read property of undefined" chứ không phải câu hữu ích bên dưới.
    const rawHeader: unknown = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawHeader)
      ? rawHeader.filter((value): value is string => typeof value === 'string')
      : typeof rawHeader === 'string'
        ? [rawHeader]
        : [];

    const authCookie = cookies.find((value) =>
      value.startsWith(`${AUTH_COOKIE}=`),
    );
    if (!authCookie) {
      throw new Error(
        `Đăng ký không đặt cookie ${AUTH_COOKIE}. Nhận được: ${cookies.join(' | ')}`,
      );
    }

    return {
      id: body.user.id,
      email: address,
      password: TEST_PASSWORD,
      token: body.accessToken,
      // Bỏ phần thuộc tính (Path, HttpOnly...); header Cookie chỉ nhận cặp
      // tên=giá trị.
      cookie: authCookie.split(';')[0],
    };
  };

  return {
    app,
    server,
    prisma,
    ai,
    queue,
    sandbox,
    signUp,
    promoteToAdmin: async (userId: string): Promise<void> => {
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'ADMIN' },
      });
    },
    reset: async (): Promise<void> => {
      await truncateAll(prisma);
      ai.reset();
      queue.reset();
      sandbox.reset();
    },
    close: async (): Promise<void> => {
      await app.close();
    },
  };
}
