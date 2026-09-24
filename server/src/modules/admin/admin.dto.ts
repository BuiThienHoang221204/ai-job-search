import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class AiHealthQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class UpdateQueueConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  concurrency?: number;

  @IsOptional()
  serial?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export const USER_ROLES = ['USER', 'ADMIN'] as const;

export class UsersQueryDto extends PaginationQueryDto {
  /** Tìm theo email hoặc tên, không phân biệt hoa thường. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: (typeof USER_ROLES)[number];
}

export class UpdateUserRoleDto {
  @IsIn(USER_ROLES)
  role!: (typeof USER_ROLES)[number];
}

export const REQUIREMENT_STATUSES = [
  'NONE',
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
] as const;

export class AdminJobsQueryDto extends PaginationQueryDto {
  /** Tìm theo chức danh hoặc tên công ty. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  source?: string;

  /** `NONE` = tin chưa từng được rút yêu cầu. */
  @IsOptional()
  @IsIn(REQUIREMENT_STATUSES)
  requirement?: (typeof REQUIREMENT_STATUSES)[number];

  /** `true` = chỉ tin gốc, bỏ những tin đã bị gộp trùng vào tin khác. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  canonicalOnly?: boolean;
}

export const ALIAS_SOURCES = ['EXACT', 'LLM', 'MANUAL'] as const;

export class SkillsQueryDto extends PaginationQueryDto {
  /** Khớp tên chuẩn hoặc bất kỳ cách viết nào của kỹ năng. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Chỉ kỹ năng có ít nhất một alias mang nguồn này. */
  @IsOptional()
  @IsIn(ALIAS_SOURCES)
  source?: (typeof ALIAS_SOURCES)[number];
}

export class RenameSkillDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}

export class MoveAliasDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  skillId!: string;
}

export class MergeSkillDto {
  @IsString()
  @IsNotEmpty()
  targetId!: string;
}

export class AiUsageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class ScrapeRunsQueryDto extends PaginationQueryDto {}

export class QueueConfigQueryDto extends PaginationQueryDto {}

export class JobSourcesQueryDto extends PaginationQueryDto {}

export class OverviewQueryDto {
  /** 1 = 24 giờ chia theo giờ; so với cùng độ dài ngay trước đó. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}

/** Khoảng thời gian theo `createdAt`, ISO 8601; bỏ trống một đầu là không chặn đầu đó. */
export class TimeRangeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ScrapePortalsQueryDto extends TimeRangeQueryDto {}

export class ScrapeBatchesQueryDto extends TimeRangeQueryDto {
  /** Chỉ lượt đêm có ít nhất một portal hỏng. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  failedOnly?: boolean;
}

export const FAILURE_KINDS = [
  'SCHEMA',
  'TIMEOUT',
  'UPSTREAM',
  'OTHER',
] as const;

export class FailuresQueryDto extends TimeRangeQueryDto {
  @IsOptional()
  @IsIn(FAILURE_KINDS)
  failureKind?: (typeof FAILURE_KINDS)[number];

  /** Khoá tác vụ chính xác, ví dụ `match.evaluate`. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  purpose?: string;

  /** Khớp một phần tên provider hoặc model, không phân biệt hoa thường. */
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  model?: string;
}

export class FailureFacetsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
