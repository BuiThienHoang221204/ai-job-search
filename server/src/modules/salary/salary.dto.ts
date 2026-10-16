import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OCCUPATION_CODES } from '../jobs/taxonomy/occupations';

export class ListPositionsQueryDto {
  @IsOptional()
  @IsIn(OCCUPATION_CODES)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
