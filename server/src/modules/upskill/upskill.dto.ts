import { IsOptional, IsString } from 'class-validator';

export class GenerateUpskillDto {
  @IsOptional() @IsString() jobId?: string;
}
