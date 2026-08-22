import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAccessCookie,
  setRefreshCookie,
  setSessionHintCookie,
} from './auth.cookie.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { LoginDto, RegisterDto } from './auth.dto.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ThrottleAuth } from '../../common/throttle.js';

/** Đăng ký và đăng nhập vừa ĐẶT COOKIE vừa trả token trong body. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @ThrottleAuth()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return issue(response, await this.auth.register(dto));
  }

  @Public()
  @ThrottleAuth()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return issue(response, await this.auth.login(dto));
  }

  /**
   * Đổi refresh token lấy cặp token mới. `@Public()` vì access token đã hết
   * hạn khi giao diện gọi tới đây - đó chính là lý do nó gọi.
   *
   * Route này KHÔNG nhận token qua body hay header: refresh token chỉ tồn tại
   * ở cookie httpOnly, nên nhận thêm đường khác là mở lại đúng lối mà cookie
   * httpOnly dựng lên để chặn. Bị chặn tần suất như đăng nhập vì nó cũng là
   * một cửa thử-sai không cần đăng nhập trước.
   */
  @Public()
  @ThrottleAuth()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = (request as { cookies?: Record<string, unknown> }).cookies;
    const token = cookies?.[REFRESH_COOKIE];
    return issue(
      response,
      await this.auth.refresh(typeof token === 'string' ? token : undefined),
    );
  }

  /**
   * `@Public()` là cố ý: đăng xuất khi token đã hết hạn vẫn phải xoá được
   * cookie, nếu không người dùng mắc kẹt với một cookie chết mà không có cách
   * nào bỏ đi. Route này chỉ xoá cookie, không đọc gì của ai.
   */
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    clearAuthCookies(response);
    return { ok: true };
  }

  /**
   * Đăng xuất trên MỌI thiết bị. Khác `logout` ở chỗ nó chạm vào server:
   * `logout` chỉ xoá cookie của đúng trình duyệt đang gọi, còn route này tăng
   * `tokenVersion` nên mọi token đã phát chết ngay ở lượt dùng kế tiếp.
   *
   * Cố ý KHÔNG `@Public()`: đây là thao tác thay đổi dữ liệu, phải biết chắc
   * ai gọi. Người dùng có token chết thì đã không còn phiên nào để đăng xuất.
   */
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.revokeAllSessions(user.id);
    clearAuthCookies(response);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

/**
 * Đặt cả ba cookie rồi trả nguyên kết quả về body. Gom lại một chỗ vì ba route
 * phát token phải đặt ĐỦ ba: thiếu cookie gợi ý phiên thì middleware của Next
 * đá người dùng về /login, mà lỗi đó chỉ lộ ra sau 15 phút.
 */
const issue = (response: Response, result: AuthResult): AuthResult => {
  setAccessCookie(response, result.accessToken);
  setRefreshCookie(response, result.refreshToken);
  setSessionHintCookie(response);
  return result;
};
