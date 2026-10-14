import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
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

export class InterviewDateDto {
  @ValidateIf((_, value) => value !== null)
  @IsISO8601(
    { strict: true },
    { message: 'Ngày phỏng vấn phải là chuỗi ISO 8601 hoặc null' },
  )
  interviewAt!: string | null;
}
