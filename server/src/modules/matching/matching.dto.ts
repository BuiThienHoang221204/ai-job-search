import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';

export class EvaluateJobDto {
  @IsString()
  jobId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export const MATCH_SORTS = ['newest', 'score_desc', 'score_asc'] as const;
export type MatchSort = (typeof MATCH_SORTS)[number];

export class ListMatchesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn([...MATCH_SORTS])
  sort?: MatchSort;
}
