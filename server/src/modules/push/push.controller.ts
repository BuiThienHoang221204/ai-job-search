import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { PushEndpointDto, SubscribePushDto } from './push.dto';
import { PushService } from './push.service';

@ApiTags('Push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @ApiOperation({
    summary: 'Khoá công khai VAPID để trình duyệt đăng ký nhận thông báo',
  })
  @Get('public-key')
  publicKey() {
    return this.push.publicKeyOf();
  }

  @ApiOperation({ summary: 'Đăng ký thiết bị hiện tại nhận nhắc học' })
  @Post('subscriptions')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribePushDto) {
    return this.push.subscribe(user.id, dto);
  }

  @ApiOperation({
    summary: 'Huỷ nhận nhắc học trên một thiết bị của chính mình',
  })
  @Delete('subscriptions')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushEndpointDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  @ApiOperation({
    summary: 'Gửi một thông báo thử tới thiết bị của chính mình',
  })
  @Post('test')
  @HttpCode(200)
  sendTest(@CurrentUser() user: AuthUser, @Body() dto: PushEndpointDto) {
    return this.push.sendTest(user.id, dto.endpoint);
  }
}
