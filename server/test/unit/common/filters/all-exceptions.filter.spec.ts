import {
  ConflictException,
  HttpException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter.js';
import { ModelUnavailableError } from 'src/common/ai/failure-kind.js';
import { Prisma } from 'src/generated/prisma/client.js';

type Captured = { status?: number; body?: unknown; ended: boolean };

function httpHost(captured: Captured, headersSent = false): ArgumentsHost {
  const response = {
    headersSent,
    getHeader: () => 'req-1',
    status(code: number) {
      captured.status = code;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
    },
    end() {
      captured.ended = true;
    },
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', originalUrl: '/api/x?y=1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function run(error: unknown, headersSent = false): Captured {
  const captured: Captured = { ended: false };
  new AllExceptionsFilter().catch(error, httpHost(captured, headersSent));
  return captured;
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('AllExceptionsFilter', () => {
  test('HttpException giữ nguyên mã và thân như Nest mặc định', () => {
    const captured = run(new ConflictException('Đang chạy'));

    expect(captured.status).toBe(409);
    expect(captured.body).toEqual({
      statusCode: 409,
      message: 'Đang chạy',
      error: 'Conflict',
    });
  });

  test('HttpException thân chuỗi được bọc thành { statusCode, message }', () => {
    const captured = run(new HttpException('Hết lượt', 429));

    expect(captured.body).toEqual({ statusCode: 429, message: 'Hết lượt' });
  });

  const aiCases: [string, unknown, number, string][] = [
    [
      'lệch schema → 502',
      namedError('AI_NoObjectGeneratedError', 'No object generated'),
      502,
      'SCHEMA',
    ],
    [
      'hết giờ → 504',
      namedError('TimeoutError', 'The operation was aborted due to timeout'),
      504,
      'TIMEOUT',
    ],
    [
      'nhà cung cấp từ chối → 503',
      namedError('AI_APICallError', 'Rate limit exceeded'),
      503,
      'UPSTREAM',
    ],
    [
      'không còn model nào dùng được → 503',
      new ModelUnavailableError('Thiếu khoá API'),
      503,
      'UPSTREAM',
    ],
  ];

  test.each(aiCases)(
    'lỗi AI %s kèm failureKind',
    (_label, error, status, failureKind) => {
      const captured = run(error);

      expect(captured.status).toBe(status);
      expect(captured.body).toMatchObject({ statusCode: status, failureKind });
      expect((captured.body as { message: string }).message).not.toMatch(
        /aborted|Rate limit|khoá API|No object/i,
      );
    },
  );

  test('lỗi 5xx không đến từ AI không bị báo là AI quá tải', () => {
    const captured = run(new Error('pdf-service trả 503 Service Unavailable'));

    expect(captured.status).toBe(503);
    expect((captured.body as { message: string }).message).not.toMatch(/AI/);
  });

  test('nhà cung cấp AI từ chối thì nói rõ là AI', () => {
    const captured = run(namedError('AI_APICallError', 'Rate limit exceeded'));

    expect((captured.body as { message: string }).message).toMatch(/AI/);
  });

  test('lỗi Prisma đã biết đi đúng đường của PrismaExceptionFilter dù thứ tự đăng ký filter thế nào', () => {
    const captured = run(
      new Prisma.PrismaClientKnownRequestError('trùng', {
        code: 'P2002',
        clientVersion: '7.9.1',
      }),
    );

    expect(captured.status).toBe(409);
    expect(captured.body).toMatchObject({ message: 'Dữ liệu đã tồn tại' });
  });

  test('lỗi lạ thành 500 với câu chung, không lộ câu lỗi thô', () => {
    const captured = run(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({
      statusCode: 500,
      message: 'Máy chủ gặp lỗi ngoài dự kiến. Hãy thử lại sau.',
      requestId: 'req-1',
    });
  });

  test('đã gửi header thì chỉ end(), không ghi thêm thân', () => {
    const captured = run(new Error('hỏng giữa stream'), true);

    expect(captured.ended).toBe(true);
    expect(captured.status).toBeUndefined();
  });

  test('ngữ cảnh không phải http thì ném lại', () => {
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const error = new Error('x');

    expect(() => new AllExceptionsFilter().catch(error, host)).toThrow(error);
  });
});
