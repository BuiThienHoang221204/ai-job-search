import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ThrottleAi } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { AutofillAnswerDto } from './ext-autofill.dto';
import { ExtAutofillService } from './ext-autofill.service';

@ExtAuth()
@Controller('ext/autofill')
export class ExtAutofillController {
  constructor(private readonly autofill: ExtAutofillService) {}

  @Post('answer')
  @ThrottleAi()
  @HttpCode(200)
  answer(@CurrentUser() user: AuthUser, @Body() dto: AutofillAnswerDto) {
    return this.autofill.answer(user.id, dto);
  }
}
