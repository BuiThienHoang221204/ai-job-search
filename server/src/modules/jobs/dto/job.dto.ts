import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

export class ListJobsQueryDto {
  /**
   * Chặn trên 100, khớp với `ListMatchesQueryDto`. Không có nó thì
   * `?limit=1000000` được chấp nhận và một request đủ để kéo cả bảng jobs ra.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  /**
   * Từ khoá đi vào truy vấn tìm kiếm. Trần ngắn vì không có chuỗi tìm kiếm thật
   * nào dài hơn thế, còn chuỗi dài thì chỉ tổ làm chậm truy vấn.
   */
  @IsOptional() @IsString() @MaxLength(200) q?: string;
}
