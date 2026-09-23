import { IsBoolean, IsOptional } from 'class-validator';

export class RefreshBriefDto {
  /** Chạy lại dù bản hiện có còn hạn. */
  @IsOptional() @IsBoolean() force?: boolean;
}
