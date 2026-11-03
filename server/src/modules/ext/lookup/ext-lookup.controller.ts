import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { ExtLookupDto } from './ext-lookup.dto';
import { ExtLookupService } from './ext-lookup.service';

@ExtAuth()
@Controller('ext/lookup')
export class ExtLookupController {
  constructor(private readonly lookup: ExtLookupService) {}

  @Post()
  @HttpCode(200)
  find(@CurrentUser() user: AuthUser, @Body() dto: ExtLookupDto) {
    return this.lookup.lookup(user.id, dto);
  }
}
