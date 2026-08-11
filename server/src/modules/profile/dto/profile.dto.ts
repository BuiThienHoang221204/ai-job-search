import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() employmentStatus?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() citizenship?: string;
  @IsOptional() @IsString() workPermit?: string;
  @IsOptional() @IsString() workPermitNote?: string;
  @IsOptional() @IsString() commuteConstraint?: string;
  @IsOptional() @IsString() remotePreference?: string;
  @IsOptional() @IsBoolean() willingToRelocate?: boolean;

  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) primarySkills?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) secondarySkills?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) lackingSkills?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  directExperienceDomains?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adjacentExperience?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) careerGoals?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) energizingTasks?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) drainingTasks?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) targetSectors?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dealBreakers?: string[];

  @IsOptional() behavioralTraits?: unknown;
  @IsOptional() experiences?: unknown;
  @IsOptional() educations?: unknown;
  @IsOptional() certificates?: unknown;
  @IsOptional() projects?: unknown;
}
