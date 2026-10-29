import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, type AuthResult } from './auth.service';
import {
  AUTH_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAccessCookie,
  setRefreshCookie,
} from './auth.cookie';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { GoogleLoginDto, LoginDto, RegisterDto } from './auth.dto';
import type { AuthUser } from '@/common/types/auth-user';
import { ThrottleAuth } from '@/common/throttle';

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

  @Public()
  @ThrottleAuth()
  @ApiOperation({ summary: 'Đăng nhập / đăng ký bằng Google' })
  @Post('google')
  @HttpCode(200)
  async google(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return issue(
      response,
      await this.auth.loginWithGoogle(dto.idToken, dto.ref),
    );
  }

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

  @Public()
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = request.cookies as Record<string, string> | undefined;
    await this.auth.logout(cookies?.[AUTH_COOKIE]);
    clearAuthCookies(response);
    return { ok: true };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá tài khoản và mọi dữ liệu của người gọi' })
  @Delete('account')
  @HttpCode(200)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.deleteAccount(user.id);
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

const issue = (response: Response, result: AuthResult) => {
  setAccessCookie(response, result.accessToken);
  setRefreshCookie(response, result.refreshToken);
  return { user: result.user };
};
