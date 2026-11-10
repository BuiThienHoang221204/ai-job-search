import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { ThrottleAuth } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import { LoginDto } from '@/modules/auth/auth.dto';
import {
  AuthService,
  type ExtAuthResult,
} from '@/modules/auth/services/auth.service';
import { ExtAuth } from './ext-auth.decorator';

type ExtUser = { user: { id: string; email: string; name: string } };

@Controller('ext/auth')
export class ExtAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @ThrottleAuth()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<ExtAuthResult> {
    return this.auth.extLogin(dto);
  }

  @Post('token')
  @HttpCode(200)
  token(@CurrentUser() user: AuthUser): Promise<ExtAuthResult> {
    return this.auth.issueExtToken(user.id);
  }

  @ExtAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): ExtUser {
    return { user: { id: user.id, email: user.email, name: user.name } };
  }
}
