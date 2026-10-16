import {
  InternalServerErrorException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator.js';
import {
  JwtAuthGuard,
  UNAUTHORIZED_MESSAGE,
} from 'src/common/guards/jwt-auth.guard.js';

/// Lớp cha do AuthGuard('jwt') sinh ra - nơi chứa canActivate thật của passport.
const passportPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
  canActivate: (context: ExecutionContext) => unknown;
};

function context(): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let superCanActivate: jest.SpyInstance;

  beforeEach(() => {
    superCanActivate = jest
      .spyOn(passportPrototype, 'canActivate')
      .mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('route có @Public() đi thẳng, không đụng tới passport', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(new JwtAuthGuard(reflector).canActivate(context())).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('route thường vẫn phải qua passport', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    void new JwtAuthGuard(reflector).canActivate(context());
    expect(superCanActivate).toHaveBeenCalledTimes(1);
  });

  it('đọc metadata ở cả method lẫn class, method thắng', () => {
    const reflector = new Reflector();
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);

    void new JwtAuthGuard(reflector).canActivate(context());

    // getAllAndOverride (chứ không phải get) mới cho phép mở một route lẻ
    // trong controller đã đóng.
    expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  describe('handleRequest', () => {
    const guard = () => new JwtAuthGuard(new Reflector());

    it('có user thì trả user', () => {
      const user = { id: 'u1' };
      expect(guard().handleRequest(null, user)).toBe(user);
    });

    it('không có user thì 401 tiếng Việt - vẫn đóng theo mặc định', () => {
      expect(() => guard().handleRequest(null, false)).toThrow(
        new UnauthorizedException(UNAUTHORIZED_MESSAGE),
      );
    });

    it('strategy ném 401 tiếng Anh thì đổi thành câu tiếng Việt', () => {
      expect(() =>
        guard().handleRequest(new UnauthorizedException(), { id: 'u1' }),
      ).toThrow(UNAUTHORIZED_MESSAGE);
    });

    it('lỗi khác (ví dụ database sập) giữ nguyên, không giả làm 401', () => {
      const failure = new InternalServerErrorException('db');
      expect(() => guard().handleRequest(failure, false)).toThrow(failure);
    });
  });
});
