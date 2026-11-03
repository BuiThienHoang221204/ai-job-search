import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { ExtProfileService } from './ext-profile.service';

@ExtAuth()
@Controller('ext/profile')
export class ExtProfileController {
  constructor(private readonly profiles: ExtProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profiles.skills(user.id);
  }

  @Get('autofill')
  autofill(@CurrentUser() user: AuthUser) {
    return this.profiles.autofill(user.id);
  }
}
