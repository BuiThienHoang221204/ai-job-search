import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import {
  CV_FONTS,
  FONT_SCALES,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  type CvFont,
  type CvFontSize,
} from './templates/typography';

const pastedJob = (dto: CreateCvDto): boolean =>
  !dto.jobId &&
  (dto.jobDescription !== undefined ||
    dto.company !== undefined ||
    dto.title !== undefined);

export class CreateCvDto {
  @IsOptional() @IsString() @MaxLength(40) jobId?: string;

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

export class UpdateCvDto {
  @IsOptional() @IsObject() content?: unknown;
  @IsOptional() @IsObject() layout?: unknown;
  @IsOptional() @IsObject() identity?: unknown;
}

export class PreviewBodyDto extends UpdateCvDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional() @IsBoolean() editing?: boolean;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;

  @IsOptional() @IsIn(Object.keys(CV_FONTS)) font?: CvFont;

  @IsOptional() @IsIn(Object.keys(FONT_SCALES)) size?: CvFontSize;

  @IsOptional()
  @IsNumber()
  @Min(LINE_HEIGHT_MIN)
  @Max(LINE_HEIGHT_MAX)
  lineHeight?: number;
}

export class SetTemplateDto {
  @IsString() @Length(1, 40) templateId!: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
  @IsOptional() @IsIn(Object.keys(CV_FONTS)) font?: CvFont;

  @IsOptional() @IsIn(Object.keys(FONT_SCALES)) size?: CvFontSize;

  @IsOptional()
  @IsNumber()
  @Min(LINE_HEIGHT_MIN)
  @Max(LINE_HEIGHT_MAX)
  lineHeight?: number;
}

export class CreateCoverLetterDto {
  @IsString() @MaxLength(40) jobId!: string;

  @IsOptional() @IsBoolean() stream?: boolean;
}

export class CreateApplicationEmailDto {
  @IsOptional() @IsString() @MaxLength(40) jobId?: string;

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

export class JobFromUrlDto {
  @IsString({ message: 'Thiếu đường dẫn' })
  @Length(1, 2000, { message: 'Đường dẫn quá dài' })
  url!: string;
}

export class ListDocumentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['CV', 'COVER_LETTER', 'APPLICATION_EMAIL'])
  kind?: 'CV' | 'COVER_LETTER' | 'APPLICATION_EMAIL';

  @IsOptional() @IsString() @MaxLength(40) jobId?: string;
}
