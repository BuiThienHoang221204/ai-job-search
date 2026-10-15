import { PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
export const JOB_SORTS = ['newest', 'salary', 'match'] as const;
export type JobSort = (typeof JOB_SORTS)[number];
export const POSTED_WINDOWS = [1, 3, 7, 30] as const;
export const MAX_JOB_OFFSET = 2_000;
const toArray = ({ value }: { value: unknown }): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) return [value];
  return [];
};

export class ListJobsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(MAX_JOB_OFFSET)
  declare offset?: number;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
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

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  subOccupation?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;
  @IsOptional()
  @Type(() => Number)
  @IsIn([...POSTED_WINDOWS])
  postedWithin?: number;

  @IsOptional()
  @IsIn([...JOB_SORTS])
  sort?: JobSort;
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  scored?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  saved?: boolean;
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  applied?: boolean;
}

export class PublicJobsQueryDto extends PickType(ListJobsQueryDto, [
  'limit',
  'offset',
  'q',
  'province',
  'occupation',
  'subOccupation',
  'workMode',
  'postedWithin',
]) {}
