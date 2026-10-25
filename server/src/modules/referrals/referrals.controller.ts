import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { ReferralsService } from './referrals.service';

@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @ApiOperation({
    summary: 'Mã mời, số bạn đã tham gia và phút giọng nói được thưởng còn lại',
  })
  @Get()
  summary(@CurrentUser() user: AuthUser) {
    return this.referrals.summary(user.id);
  }
}
