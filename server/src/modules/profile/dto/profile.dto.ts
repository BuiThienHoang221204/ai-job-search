import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { IsBoundedJson } from '../../../common/validators/bounded-json.js';

/// Trần cho các trường chữ ngắn (chức danh, địa điểm, quốc tịch...).
const SHORT = 200;

/// Trần cho phần tự giới thiệu. Dài hơn hẳn các trường trên vì nó là đoạn văn,
/// nhưng vẫn phải có trần: nó đi thẳng vào mọi prompt chấm điểm.
const SUMMARY = 4_000;

/// Trần cho mỗi phần tử trong các mảng kỹ năng, mục tiêu, lĩnh vực.
const ITEM = 200;

/// Số phần tử tối đa mỗi mảng. 60 kỹ năng đã là nhiều hơn bất kỳ hồ sơ thật nào;
/// quá số đó thì gần như chắc chắn là dán nhầm hoặc cố tình nhồi prompt.
const ITEMS = 60;

/// Chặn trên cho các khối JSON tự do. 64KB đủ cho một sự nghiệp dài kể chi tiết,
/// và vẫn nhỏ hơn nhiều so với mức làm phình prompt tới mức đáng lo.
const JSON_BOUNDS = { maxBytes: 64 * 1024, maxItems: 100 } as const;

/**
 * Mọi trường đều tuỳ chọn, và service chỉ ghi những trường được gửi lên.
 *
 * Ghi từng phần là có chủ đích: gửi cả hồ sơ mỗi lần lưu sẽ khiến một tab mở lâu
 * ghi đè mất thay đổi mà tab kia vừa lưu. Xem thêm ghi chú ở `profile.controller`
 * về việc động từ là PUT nhưng thân request là một phần.
 *
 * Mọi trần độ dài ở đây tồn tại vì một lý do chung: **những giá trị này đi thẳng
 * vào prompt gửi lên nhà cung cấp model**. Không có trần thì một hồ sơ là một
 * cách để bơm prompt tuỳ ý dài, tốn tiền mỗi lần chấm điểm.
 */
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(SHORT) headline?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) location?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) country?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) employmentStatus?: string;
  @IsOptional() @IsString() @MaxLength(SUMMARY) summary?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) citizenship?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) workPermit?: string;
  @IsOptional() @IsString() @MaxLength(SUMMARY) workPermitNote?: string;
  @IsOptional() @IsString() @MaxLength(SUMMARY) commuteConstraint?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) remotePreference?: string;
  @IsOptional() @IsBoolean() willingToRelocate?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  primarySkills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  secondarySkills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  lackingSkills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  directExperienceDomains?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  adjacentExperience?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  careerGoals?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  energizingTasks?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  drainingTasks?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  targetSectors?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS)
  @IsString({ each: true })
  @MaxLength(ITEM, { each: true })
  dealBreakers?: string[];

  // Năm khối JSON tự do. Chỉ chặn trên về kích thước, KHÔNG áp schema hình dạng -
  // xem lý do trong `bounded-json.ts`.
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) behavioralTraits?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) experiences?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) educations?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) certificates?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) projects?: unknown;
}
