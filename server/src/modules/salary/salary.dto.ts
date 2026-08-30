import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OCCUPATIONS } from '../jobs/taxonomy/occupations.js';

const OCCUPATION_CODES = OCCUPATIONS.map((o) => o.code);

export class ListPositionsQueryDto {
  /** Lọc theo mã ngành. Mã lạ bị chặn ở tầng validate chứ không rơi vào truy vấn. */
  @IsOptional()
  @IsIn(OCCUPATION_CODES)
  occupation?: string;

  /** Tìm theo tên vị trí, khớp chuỗi con không phân biệt hoa thường. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
