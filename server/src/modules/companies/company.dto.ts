import { IsBoolean, IsOptional } from 'class-validator';

export class RefreshBriefDto {
  @IsOptional() @IsBoolean() force?: boolean;
}
