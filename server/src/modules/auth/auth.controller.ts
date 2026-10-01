import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @ThrottleAuth()
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return issue(response, await this.auth.register(dto));
  }

  @Public()
  @ThrottleAuth()
  @ApiOperation({ summary: 'Đăng nhập hệ thống' })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return issue(response, await this.auth.login(dto));
  }

  /** `@Public()` vì access token đã hết hạn lúc gọi tới đây; chỉ nhận token qua cookie httpOnly, không nhận qua body/header. */
  @Public()
  @ThrottleAuth()
  @ApiOperation({ summary: 'Đổi refresh token lấy cặp token mới' })
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
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    clearAuthCookies(response);
    return { ok: true };
  }

  /** Khác `logout`: tăng `tokenVersion` nên mọi token đã phát chết ngay, không riêng cookie của trình duyệt đang gọi. */
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất trên mọi thiết bị' })
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

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

/** Đặt đủ ba cookie rồi trả nguyên kết quả - thiếu cookie gợi ý phiên thì middleware Next đá về /login dù token vẫn sống. */
const issue = (response: Response, result: AuthResult): AuthResult => {
  setAccessCookie(response, result.accessToken);
  setRefreshCookie(response, result.refreshToken);
  setSessionHintCookie(response);
  return result;
};
