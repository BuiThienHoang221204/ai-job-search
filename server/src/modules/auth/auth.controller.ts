import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { clearAuthCookie, setAuthCookie } from './auth.cookie.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ThrottleAuth } from '../../common/throttle.js';

/// Đăng ký và đăng nhập vừa ĐẶT COOKIE vừa trả token trong body.
///
/// Hai đường là cố ý, không phải thừa: giao diện web dùng cookie (an toàn hơn
/// vì JavaScript không đọc được), còn script, bài kiểm thử và về sau là ứng
/// dụng di động thì dùng Bearer. `JwtStrategy` chấp nhận cả hai.
///
/// `passthrough: true` là bắt buộc khi tiêm @Res: thiếu nó thì Nest giao toàn
/// bộ việc trả lời cho mình, và giá trị return từ hàm sẽ không bao giờ được
/// gửi đi - request treo cho đến khi hết giờ.
///
/// Ba route `@Public()` dưới đây là TOÀN BỘ bề mặt không cần đăng nhập của
/// máy chủ. Mọi route khác đóng theo mặc định nhờ APP_GUARD trong CommonModule.
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
    const result = await this.auth.register(dto);
    setAuthCookie(response, result.accessToken);
    return result;
  }

  @Public()
  @ThrottleAuth()
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

  /// `@Public()` là cố ý: đăng xuất khi token đã hết hạn vẫn phải xoá được
  /// cookie, nếu không người dùng mắc kẹt với một cookie chết mà không có cách
  /// nào bỏ đi. Route này chỉ xoá cookie, không đọc gì của ai.
  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    clearAuthCookie(response);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
