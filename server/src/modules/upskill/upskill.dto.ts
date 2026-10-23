import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { STUDY_TIMES } from './utils/study-reminder';

export const WEEK_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export class GenerateUpskillDto {
  @IsOptional() @IsString() @MaxLength(40) jobId?: string;
}

export class LearningKeyDto {
  @IsString()
  @Length(1, 120, { message: 'Mã kỹ năng không hợp lệ' })
  key!: string;
}

export class SaveLearningDto {
  @IsString({ message: 'Thiếu tên kỹ năng' })
  @Length(1, 80, { message: 'Tên kỹ năng phải từ 1 tới 80 ký tự' })
  skillName!: string;

  @IsIn(['LEARNING', 'SKIPPED'], { message: 'Trạng thái không hợp lệ' })
  status!: 'LEARNING' | 'SKIPPED';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsBoolean({ each: true })
  steps?: boolean[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(WEEK_DAYS, { each: true, message: 'Ngày học không hợp lệ' })
  days?: string[];
}

export class LearningSettingsDto {
  @IsIn(STUDY_TIMES, {
    message: 'Giờ học phải từ 06:00 tới 23:00, bước 30 phút',
  })
  studyTime!: string;
}
