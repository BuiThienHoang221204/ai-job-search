import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { clearAuthCookie, setAuthCookie } from './auth.cookie.js';
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
    const result = await this.auth.register(dto);
    setAuthCookie(response, result.accessToken);
    return result;
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
    const result = await this.auth.login(dto);
    setAuthCookie(response, result.accessToken);
    return result;
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
    clearAuthCookie(response);
    return { ok: true };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
