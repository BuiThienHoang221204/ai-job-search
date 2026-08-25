import type { ArgumentsHost } from '@nestjs/common';
import { PrismaExceptionFilter } from 'src/common/filters/prisma-exception.filter.js';
import { Prisma } from 'src/generated/prisma/client.js';

type Captured = { status: number; body: unknown };

type FakeResponse = {
  status(code: number): FakeResponse;
  json(body: unknown): void;
};

/// Dựng ArgumentsHost giả tối thiểu, đủ cho những gì filter chạm vào.
function httpHost(captured: Captured): ArgumentsHost {
  const response: FakeResponse = {
    status(code) {
      captured.status = code;
      return response;
    },
    json(body) {
      captured.body = body;
    },
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'PATCH', originalUrl: '/api/jobs/7?x=1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

function prismaError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('lỗi từ Prisma', {
    code,
    clientVersion: '7.9.1',
    meta,
  });
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  const cases: [string, string, number][] = [
    ['P2025 - bản ghi không còn', 'P2025', 404],
    ['P2002 - trùng ràng buộc unique', 'P2002', 409],
    ['P2003 - khoá ngoại không hợp lệ', 'P2003', 400],
  ];

  it.each(cases)('%s -> %s', (_label, code, expected) => {
    const captured = {} as Captured;
    filter.catch(prismaError(code), httpHost(captured));
    expect(captured.status).toBe(expected);
  });

  it('mã lỗi lạ trả 500 thay vì để lọt ra ngoài', () => {
    const captured = {} as Captured;
    filter.catch(prismaError('P2038'), httpHost(captured));
    expect(captured.status).toBe(500);
  });

  it('thân phản hồi cùng dạng với lỗi do controller ném ra', () => {
    const captured = {} as Captured;
    filter.catch(prismaError('P2025'), httpHost(captured));
    expect(captured.body).toEqual({
      statusCode: 404,
      message: 'Không tìm thấy dữ liệu',
      error: 'Not Found',
    });
  });

  it('không để tên bảng hay tên cột rò ra phản hồi', () => {
    const captured = {} as Captured;
    filter.catch(
      prismaError('P2002', { target: ['users_email_key'], modelName: 'User' }),
      httpHost(captured),
    );
    const serialised = JSON.stringify(captured.body);
    expect(serialised).not.toContain('users_email_key');
    expect(serialised).not.toContain('User');
  });

  it('ngoài ngữ cảnh HTTP thì ném lại để hàng đợi thấy job hỏng', () => {
    const queueHost = {
      getType: () => 'rpc',
    } as unknown as ArgumentsHost;
    const error = prismaError('P2025');
    expect(() => filter.catch(error, queueHost)).toThrow(error);
  });
});
