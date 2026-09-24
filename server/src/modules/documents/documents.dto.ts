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
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import type { PdfEngine } from './services/documents.service.js';

/** Chỉ kiểm khi người dùng ĐÃ chạm vào một trong ba trường — chép điều kiện của mail sang đây là giết "CV tổng quát", xem README. */
const pastedJob = (dto: CreateCvDto): boolean =>
  !dto.jobId &&
  (dto.jobDescription !== undefined ||
    dto.company !== undefined ||
    dto.title !== undefined);

export class CreateCvDto {
  @IsOptional() @IsString() jobId?: string;

  @IsOptional() @IsIn(['vi', 'en']) language?: 'vi' | 'en';

  /** Người gọi tự stream nên ĐỪNG xếp hàng đợi — thiếu cờ này là hai lượt gọi model cho một lần bấm. */
  @IsOptional() @IsBoolean() stream?: boolean;

  /** Trần và câu báo lỗi giữ khớp `CreateApplicationEmailDto`. */
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

/** Chọn đường sinh PDF. `@IsIn` để chuỗi lạ bị báo lỗi thay vì rơi về mặc định. */
export class PdfQueryDto {
  @IsOptional() @IsIn(['latex', 'html']) engine?: PdfEngine;
}

/** Để `unknown` rồi cho zod kiểm trong service: khai hình dạng lần hai bằng class-validator là hai bản sẽ trôi khỏi nhau. */
export class UpdateCvDto {
  @IsOptional() @IsObject() content?: unknown;
  @IsOptional() @IsObject() layout?: unknown;
}

/** Xem trước bản nháp CHƯA lưu. Thiếu trường nào thì lấy bản đã lưu cho trường đó. */
export class PreviewBodyDto extends UpdateCvDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

/** Xem trước một mẫu mà KHÔNG lưu. Bỏ trống thì xem đúng mẫu đang lưu. */
export class PreviewQueryDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

/** `templateId` do service tra trong `templates/registry.ts`; `accent` chặn bằng regex vì nó đi thẳng vào CSS. */
export class SetTemplateDto {
  @IsString() @Length(1, 40) templateId!: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

export class CreateCoverLetterDto {
  @IsString() jobId!: string;

  /** Xem docblock của `CreateCvDto.stream`. */
  @IsOptional() @IsBoolean() stream?: boolean;
}

/** Có `jobId` thì ba trường kia bị bỏ qua, không có thì cả ba bắt buộc — nửa bộ dữ liệu bị chặn ở đây. */
export class CreateApplicationEmailDto {
  @IsOptional() @IsString() jobId?: string;

  /** Sàn 50 cao hơn sàn 20 của tin tuyển dụng: JD ngắn hơn thế không đủ cho model viết mail mà không bịa. */
  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu mô tả công việc' })
  @Length(50, 60_000, {
    message: 'Mô tả công việc quá ngắn hoặc quá dài (cần 50 tới 60.000 ký tự)',
  })
  jobDescription?: string;

  /** Dùng `@Length` thay cặp min/max và đặt `message` tiếng Việt: giao diện NỐI cả mảng lỗi, thiếu giá trị là mọi decorator hỏng cùng lúc. */
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

  /** Chỉ tài liệu đã tạo cho ĐÚNG tin này. */
  @IsOptional() @IsString() jobId?: string;
}
