import {
  CanActivate,
  Controller,
  Get,
  Logger,
  Module,
  RequestMethod,
  UseGuards,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter } from 'node:events';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Request, Response } from 'express';
import { RequestLogMiddleware } from 'src/common/middleware/request-log.middleware.js';

/// Gom lại từng dòng log thay vì kiểm tra lời gọi spy: jest.setup.ts đã tắt
/// đầu ra của Logger nhưng phương thức vẫn được gọi, nên nội dung vẫn lấy được.
function captureLogs(): Record<'log' | 'warn' | 'error', string[]> {
  const captured: Record<'log' | 'warn' | 'error', string[]> = {
    log: [],
    warn: [],
    error: [],
  };
  for (const level of ['log', 'warn', 'error'] as const) {
    jest
      .spyOn(Logger.prototype, level)
      .mockImplementation(
        (message: unknown) => void captured[level].push(String(message)),
      );
  }
  return captured;
}

describe('RequestLogMiddleware', () => {
  let captured: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    captured = captureLogs();
  });
  afterEach(() => jest.restoreAllMocks());

  /// Gọi middleware với req/res giả, rồi phát sự kiện 'finish' như Express làm
  /// khi phản hồi đã gửi xong.
  function run(originalUrl: string, statusCode: number, method = 'GET'): void {
    const response = Object.assign(new EventEmitter(), { statusCode });
    const next = jest.fn();
    new RequestLogMiddleware().use(
      { method, originalUrl } as Request,
      response as unknown as Response,
      next,
    );
    // Chưa 'finish' thì chưa được ghi gì - mã trạng thái lúc đó chưa chốt.
    expect(next).toHaveBeenCalledTimes(1);
    response.emit('finish');
  }

  it('ghi phương thức, đường dẫn và mã trạng thái', () => {
    run('/api/jobs', 201, 'POST');
    expect(captured.log).toHaveLength(1);
    expect(captured.log[0]).toMatch(/^POST \/api\/jobs 201 \d+ms$/);
  });

  it('không đưa query string vào log vì đó là nơi token hay bị nhét vào', () => {
    run('/api/jobs?token=bi-mat&q=nestjs', 200);
    expect(captured.log[0]).toContain('/api/jobs');
    expect(captured.log[0]).not.toContain('bi-mat');
    expect(captured.log[0]).not.toContain('?');
  });

  it('4xx là warn, 5xx là error, 2xx là log', () => {
    run('/api/a', 200);
    run('/api/b', 401);
    run('/api/c', 500);
    expect(captured.log).toHaveLength(1);
    expect(captured.warn[0]).toContain(' 401 ');
    expect(captured.error[0]).toContain(' 500 ');
  });

  it('chưa gửi xong phản hồi thì chưa ghi dòng nào', () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    new RequestLogMiddleware().use(
      { method: 'GET', originalUrl: '/api/jobs' } as Request,
      response as unknown as Response,
      jest.fn(),
    );
    expect(captured.log).toHaveLength(0);
  });
});

/// Guard luôn từ chối, đứng thay JwtAuthGuard.
class DenyGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Controller('jobs')
class ProbeController {
  @Get()
  @UseGuards(DenyGuard)
  list(): string {
    return 'không bao giờ tới đây';
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestLogMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}

/// Dựng một app Nest thật (không đụng database) để kiểm đúng điều khiến
/// middleware được chọn thay cho interceptor. Một interceptor đặt ở đây sẽ
/// không ghi được dòng nào cho cả hai trường hợp dưới.
describe('RequestLogMiddleware trong app Nest thật', () => {
  // Tham số App là của supertest: thiếu nó thì getHttpServer() trả any và
  // request() nhận vào một giá trị không kiểu.
  let app: INestApplication<App>;
  let captured: ReturnType<typeof captureLogs>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    captured = captureLogs();
  });
  afterEach(() => jest.restoreAllMocks());

  it('vẫn ghi request bị guard chặn - thứ interceptor không thấy', async () => {
    await request(app.getHttpServer()).get('/jobs').expect(403);
    expect(captured.warn.join('\n')).toMatch(/^GET \/jobs 403 \d+ms$/m);
  });

  it('vẫn ghi đường dẫn không tồn tại', async () => {
    await request(app.getHttpServer()).get('/khong-co-route-nay').expect(404);
    expect(captured.warn.join('\n')).toMatch(
      /^GET \/khong-co-route-nay 404 \d+ms$/m,
    );
  });
});
