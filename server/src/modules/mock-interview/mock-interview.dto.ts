import { IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

/** Lọc danh sách buổi luyện, để tìm lại buổi đang dở sau khi tải lại trang. */
export class ListMockInterviewsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Mã công việc không hợp lệ' })
  jobId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60, { message: 'Tên kịch bản không hợp lệ' })
  workflow?: string;
}

export class OpenMockInterviewDto {
  @IsString({ message: 'Thiếu mã công việc' })
  @Length(1, 40, { message: 'Mã công việc không hợp lệ' })
  jobId!: string;
}

export class AnswerTurnDto {
  @IsString()
  @Length(1, 4000, { message: 'Câu trả lời trống hoặc quá dài' })
  text!: string;
}
