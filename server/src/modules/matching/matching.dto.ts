import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class EvaluateJobDto {
  @IsString()
  jobId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ListMatchesQueryDto extends PaginationQueryDto {}
