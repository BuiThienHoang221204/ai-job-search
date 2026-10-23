import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

const ENDPOINT_MAX = 1_000;
const KEY_MAX = 200;

class PushKeysDto {
  @IsString() @MaxLength(KEY_MAX) p256dh!: string;
  @IsString() @MaxLength(KEY_MAX) auth!: string;
}

export class PushEndpointDto {
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'Endpoint thông báo đẩy không hợp lệ' },
  )
  @MaxLength(ENDPOINT_MAX)
  endpoint!: string;
}

export class SubscribePushDto extends PushEndpointDto {
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
