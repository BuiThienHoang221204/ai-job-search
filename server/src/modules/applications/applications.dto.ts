import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ApplicationStatus } from '@/generated/prisma/enums';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { ALL_STATUSES } from './transitions';

export class CreateApplicationDto {
  @IsString() jobId!: string;

  @IsOptional()
  skipDocuments?: boolean;
}

export class ListApplicationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ALL_STATUSES)
  status?: ApplicationStatus;
}

export class ApplicationJobsDto {
  @IsOptional()
  @IsIn(ALL_STATUSES)
  status?: ApplicationStatus;
}

export class UpdateStatusDto {
  @IsIn(ALL_STATUSES)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
