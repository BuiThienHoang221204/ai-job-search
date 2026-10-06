import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

/** `fields` đến từ HTTP nên chỉ là danh sách ĐỀ NGHỊ — `apply()` lọc lại qua danh sách trắng `APPLICABLE_FIELDS`. */
export class ApplyDraftDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  fields!: string[];
}
