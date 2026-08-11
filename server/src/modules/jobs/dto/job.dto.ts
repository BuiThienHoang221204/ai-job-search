import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/// Dùng để nạp tin tuyển dụng vào hệ thống. Giai đoạn này dùng để dán JD thủ
/// công và chạy eval; skill /scrape sẽ dùng chính endpoint này sau.
export class CreateJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  company!: string;

  @IsString()
  @MinLength(20, { message: 'Mô tả công việc quá ngắn để đánh giá' })
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
  @IsOptional() @Type(() => Number) @IsInt() limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() offset?: number;
  @IsOptional() @IsString() q?: string;
}
