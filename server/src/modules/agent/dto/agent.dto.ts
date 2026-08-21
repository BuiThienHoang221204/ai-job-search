import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class StartAgentDto {
  /** Tên kịch bản trong `.claude/commands/`, ví dụ "apply". */
  @IsString()
  @Length(1, 60, { message: 'Tên kịch bản không hợp lệ' })
  workflow!: string;

  /** Tin tuyển dụng đã lưu trong hệ thống. Kịch bản `/interview` cần nó. */
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Mã công việc không hợp lệ' })
  jobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Đường dẫn quá dài' })
  jobUrl?: string;

  /** Trần 60KB giống `CreateJobDto`: mô tả đi thẳng vào prompt. */
  @IsOptional()
  @IsString()
  @MaxLength(60_000, { message: 'Mô tả công việc quá dài' })
  jobDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ghi chú quá dài' })
  note?: string;
}

export class AnswerAgentDto {
  @IsString()
  @Length(1, 4000, { message: 'Câu trả lời trống hoặc quá dài' })
  text!: string;
}
