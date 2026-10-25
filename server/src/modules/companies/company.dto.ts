import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class FollowCompanyDto {
  @IsString() @MaxLength(40) jobId!: string;
}

export class RefreshBriefDto {
  @IsOptional() @IsBoolean() force?: boolean;
}
