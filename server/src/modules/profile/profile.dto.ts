import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ArrayMaxSize,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsBoundedJson } from '@/common/validators/bounded-json';

const SHORT = 200;

const MAX_MONTHLY_SALARY = 2_000_000_000;

const SUMMARY = 4_000;

const ITEM = 200;

const ITEMS = 60;

const JSON_BOUNDS = { maxBytes: 64 * 1024, maxItems: 100 } as const;

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(SHORT) headline?: string;
  @IsOptional() @IsString() @MaxLength(SHORT) location?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
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
  @IsInt()
  @Min(0)
  @Max(MAX_MONTHLY_SALARY)
  currentSalary?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONTHLY_SALARY)
  expectedSalary?: number;

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

  @IsOptional() @IsBoundedJson(JSON_BOUNDS) behavioralTraits?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) experiences?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) educations?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) certificates?: unknown;
  @IsOptional() @IsBoundedJson(JSON_BOUNDS) projects?: unknown;
}

export const EXPERIENCE_LEVELS = [
  'INTERN',
  'FRESHER',
  'JUNIOR',
  'MIDDLE',
  'SENIOR',
  'LEAD',
] as const;

export class QuickStartProfileDto {
  @IsString() @MaxLength(SHORT) occupationCode!: string;
  @IsOptional() @IsString() @MaxLength(SHORT) subOccupationCode?: string;
  @IsOptional() @IsIn(EXPERIENCE_LEVELS) experienceLevel?: string;
}
