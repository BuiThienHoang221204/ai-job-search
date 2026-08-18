import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

/**
 * Dùng để nạp tin tuyển dụng vào hệ thống. Giai đoạn này dùng để dán JD thủ
 * công và chạy eval; skill /scrape sẽ dùng chính endpoint này sau.
 */
export class CreateJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  company!: string;

  /**
   * Trần 60KB: mô tả đi thẳng vào prompt chấm điểm, nên không có trần nghĩa là
   * một tin dán tay có thể bơm prompt dài tuỳ ý. Tin thật dài nhất đo được từ
   * bốn portal còn xa mức này.
   */
  @IsString()
  @MinLength(20, { message: 'Mô tả công việc quá ngắn để đánh giá' })
  @MaxLength(60_000, { message: 'Mô tả công việc quá dài' })
  description!: string;

  @IsOptional() @IsUrl() url?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsString() companyLogo?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() workMode?: string;
  @IsOptional() @IsString() salaryRaw?: string;
  @IsOptional() @Type(() => Number) @IsInt() salaryMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() salaryMax?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

/** Ba cách xếp danh sách việc làm, khớp với ô "Sắp xếp" trên giao diện. */
export const JOB_SORTS = ['newest', 'salary', 'match'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

/** Các mốc "đăng trong vòng N ngày". */
export const POSTED_WINDOWS = [1, 3, 7, 30] as const;

/**
 * Trần độ sâu phân trang.
 *
 * `OFFSET` lớn buộc Postgres đọc rồi vứt bỏ toàn bộ hàng phía trước, nên độ sâu
 * không chặn là một đường làm nghẽn database rất rẻ. Mọi trang tuyển dụng thật
 * đều chặn ở đâu đó; không ai lật tới trang 100 để tìm việc.
 */
export const MAX_JOB_OFFSET = 2_000;

/**
 * Nhận cả `?province=HN` lẫn `?province=HN&province=HCM`.
 *
 * Express gom tham số trùng tên thành mảng nhưng để nguyên chuỗi khi chỉ có một
 * giá trị, nên không bọc lại thì `@IsArray` sẽ đỏ ở đúng trường hợp phổ biến
 * nhất - người dùng chọn một tỉnh.
 */
const toArray = ({ value }: { value: unknown }): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) return [value];
  return [];
};

export class ListJobsQueryDto extends PaginationQueryDto {
  /**
   * Khai lại `offset` chỉ để thêm trần. Decorator của lớp cha vẫn có hiệu lực,
   * nên `@Min(0)` không phải viết lại.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(MAX_JOB_OFFSET)
  declare offset?: number;

  /**
   * Từ khoá đi vào truy vấn tìm kiếm. Trần ngắn vì không có chuỗi tìm kiếm thật
   * nào dài hơn thế, còn chuỗi dài thì chỉ tổ làm chậm truy vấn.
   */
  @IsOptional() @IsString() @MaxLength(200) q?: string;

  /** Mã tỉnh/thành. Nhiều mã = HOẶC, giống mọi bộ lọc trên trang tuyển dụng. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  province?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  occupation?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  workMode?: string[];

  /**
   * Lương tối thiểu, đơn vị VND. So với `salaryMax` của tin chứ không phải
   * `salaryMin`: người dùng hỏi "tin này có thể trả tới mức tôi cần không".
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  /** Chỉ tin đăng trong vòng N ngày. */
  @IsOptional()
  @Type(() => Number)
  @IsIn([...POSTED_WINDOWS])
  postedWithin?: number;

  @IsOptional()
  @IsIn([...JOB_SORTS])
  sort?: JobSort;

  /** `true` = chỉ tin ĐÃ có đánh giá AI, dùng cho lối vào "Việc làm phù hợp". */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  scored?: boolean;
}
