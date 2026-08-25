import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Kích thước trang khi client không nói gì. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Trần một trang. Không có nó thì `?limit=1000000` được chấp nhận và một
 * request đủ để kéo cả bảng ra.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Hợp đồng phân trang chung cho mọi API danh sách. Kế thừa class này thay vì
 * gõ lại `limit`/`offset`, để trần và mặc định chỉ tồn tại ở một chỗ.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
