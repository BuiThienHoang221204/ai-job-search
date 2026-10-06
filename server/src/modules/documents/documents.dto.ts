import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import type { PdfEngine } from './services/documents.service';

const pastedJob = (dto: CreateCvDto): boolean =>
  !dto.jobId &&
  (dto.jobDescription !== undefined ||
    dto.company !== undefined ||
    dto.title !== undefined);

export class CreateCvDto {
  @IsOptional() @IsString() jobId?: string;

  @IsOptional() @IsIn(['vi', 'en']) language?: 'vi' | 'en';

  @IsOptional() @IsBoolean() stream?: boolean;

  @ValidateIf(pastedJob)
  @IsString({ message: 'Thiếu mô tả công việc' })
  @Length(50, 60_000, {
    message: 'Mô tả công việc quá ngắn hoặc quá dài (cần 50 tới 60.000 ký tự)',
  })
  jobDescription?: string;

  @ValidateIf(pastedJob)
  @IsString({ message: 'Thiếu tên công ty' })
  @Length(1, 300, { message: 'Tên công ty phải từ 1 tới 300 ký tự' })
  company?: string;

  @ValidateIf(pastedJob)
  @IsString({ message: 'Thiếu tên vị trí ứng tuyển' })
  @Length(1, 300, { message: 'Tên vị trí phải từ 1 tới 300 ký tự' })
  title?: string;
}

export class PdfQueryDto {
  @IsOptional() @IsIn(['latex', 'html']) engine?: PdfEngine;
}

export class UpdateCvDto {
  @IsOptional() @IsObject() content?: unknown;
  @IsOptional() @IsObject() layout?: unknown;
}

export class PreviewBodyDto extends UpdateCvDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

export class PreviewQueryDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

export class SetTemplateDto {
  @IsString() @Length(1, 40) templateId!: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

export class CreateCoverLetterDto {
  @IsString() jobId!: string;

  @IsOptional() @IsBoolean() stream?: boolean;
}

export class CreateApplicationEmailDto {
  @IsOptional() @IsString() jobId?: string;

  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu mô tả công việc' })
  @Length(50, 60_000, {
    message: 'Mô tả công việc quá ngắn hoặc quá dài (cần 50 tới 60.000 ký tự)',
  })
  jobDescription?: string;

  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu tên công ty' })
  @Length(1, 300, { message: 'Tên công ty phải từ 1 tới 300 ký tự' })
  company?: string;

  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu tên vị trí ứng tuyển' })
  @Length(1, 300, { message: 'Tên vị trí phải từ 1 tới 300 ký tự' })
  title?: string;
}

export class CreateFormAnswerDto {
  @IsString()
  @MinLength(5, { message: 'Câu hỏi quá ngắn' })
  question!: string;

  @IsOptional() @IsString() jobId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(5000)
  characterLimit?: number;
}

export class JobFromUrlDto {
  @IsString({ message: 'Thiếu đường dẫn' })
  @Length(1, 2000, { message: 'Đường dẫn quá dài' })
  url!: string;
}

export class ListDocumentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['CV', 'COVER_LETTER', 'APPLICATION_EMAIL', 'FORM_ANSWER'])
  kind?: 'CV' | 'COVER_LETTER' | 'APPLICATION_EMAIL' | 'FORM_ANSWER';

  @IsOptional() @IsString() jobId?: string;
}
