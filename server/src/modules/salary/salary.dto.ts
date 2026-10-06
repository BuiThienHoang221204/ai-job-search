import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OCCUPATIONS } from '../jobs/taxonomy/occupations';

const OCCUPATION_CODES = OCCUPATIONS.map((o) => o.code);

export class ListPositionsQueryDto {
  @IsOptional()
  @IsIn(OCCUPATION_CODES)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
