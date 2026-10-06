import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { OCCUPATIONS } from '../jobs/taxonomy/occupations';

const OCCUPATION_CODES = OCCUPATIONS.map((o) => o.code);

export const QUESTION_TYPES = [
  'KIEN_THUC',
  'QUY_TRINH',
  'HANH_VI',
  'DONG_CO',
] as const;

export const DIFFICULTIES = ['Dễ', 'Trung bình', 'Khó'] as const;

export class ListQuestionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(OCCUPATION_CODES)
  industry?: string;

  @IsOptional()
  @IsIn(QUESTION_TYPES)
  type?: (typeof QUESTION_TYPES)[number];

  @IsOptional()
  @IsIn(DIFFICULTIES)
  difficulty?: (typeof DIFFICULTIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
