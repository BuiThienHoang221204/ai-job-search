import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { OCCUPATIONS } from '../jobs/taxonomy/occupations.js';

const OCCUPATION_CODES = OCCUPATIONS.map((o) => o.code);

export const QUESTION_TYPES = [
  'KIEN_THUC',
  'QUY_TRINH',
  'HANH_VI',
  'DONG_CO',
] as const;

export const DIFFICULTIES = ['Dễ', 'Trung bình', 'Khó'] as const;

export class ListQuestionsQueryDto extends PaginationQueryDto {
  /** Mã lạ bị chặn ở tầng validate chứ không rơi vào truy vấn. */
  @IsOptional()
  @IsIn(OCCUPATION_CODES)
  industry?: string;

  @IsOptional()
  @IsIn(QUESTION_TYPES)
  type?: (typeof QUESTION_TYPES)[number];

  @IsOptional()
  @IsIn(DIFFICULTIES)
  difficulty?: (typeof DIFFICULTIES)[number];

  /** Tìm trong nội dung câu hỏi tiếng Việt, khớp chuỗi con không phân biệt hoa thường. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
