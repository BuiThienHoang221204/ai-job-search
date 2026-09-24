import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class PrepDto {
  @IsString() jobId!: string;
  @IsOptional() @IsBoolean() force?: boolean;
}
