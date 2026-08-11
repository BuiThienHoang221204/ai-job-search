import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { clearAuthCookie, setAuthCookie } from './auth.cookie.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthUser } from './jwt.strategy.js';

/// Đăng ký và đăng nhập vừa ĐẶT COOKIE vừa trả token trong body.
///
/// Hai đường là cố ý, không phải thừa: giao diện web dùng cookie (an toàn hơn
/// vì JavaScript không đọc được), còn script, bài kiểm thử và về sau là ứng
/// dụng di động thì dùng Bearer. `JwtStrategy` chấp nhận cả hai.
///
/// `passthrough: true` là bắt buộc khi tiêm @Res: thiếu nó thì Nest giao toàn
/// bộ việc trả lời cho mình, và giá trị return từ hàm sẽ không bao giờ được
/// gửi đi - request treo cho đến khi hết giờ.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(dto);
    setAuthCookie(response, result.accessToken);
    return result;
  }

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

  /// Không đặt JwtAuthGuard: đăng xuất khi token đã hết hạn vẫn phải xoá được
  /// cookie, nếu không người dùng mắc kẹt với một cookie chết mà không có cách
  /// nào bỏ đi.
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    clearAuthCookie(response);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
