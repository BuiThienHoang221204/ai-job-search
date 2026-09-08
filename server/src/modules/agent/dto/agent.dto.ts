import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

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

  /**
   * Có soạn kèm thư xin việc hay không. MẶC ĐỊNH LÀ KHÔNG.
   *
   * Đo trên 114 bước `/apply` thật: riêng việc gõ thư xin việc mất 1.024 giây
   * ở `save_artifact` - khoảng một phần tư quãng chờ - cho một tài liệu mà
   * phần lớn tin trên TopCV hay VietnamWorks không đòi.
   *
   * Hỏi Ở ĐÂY chứ không hỏi giữa lượt chạy bằng `ask_user`: tool đó khai
   * `stopOnTool`, tức nó CẮT ĐỨT lượt chạy và bắt gọi model lại từ đầu với
   * toàn bộ hội thoại cũ. Hỏi lúc người dùng đang chờ là bắt họ chờ chính họ.
   */
  @IsOptional()
  @IsBoolean()
  coverLetter?: boolean;
}

/**
 * Lọc danh sách lượt chạy. Màn Phỏng vấn thử dùng nó để tìm lại buổi đang dở
 * của đúng công việc này sau khi người dùng tải lại trang - một buổi luyện kéo
 * dài hàng chục phút, mất nó vì một lần F5 là mất cả buổi.
 */
export class ListAgentRunsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Mã công việc không hợp lệ' })
  jobId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60, { message: 'Tên kịch bản không hợp lệ' })
  workflow?: string;
}

export class ReadArtifactDto {
  @IsString()
  @Length(1, 200, { message: 'Tên file không hợp lệ' })
  name!: string;
}

export class AnswerAgentDto {
  @IsString()
  @Length(1, 4000, { message: 'Câu trả lời trống hoặc quá dài' })
  text!: string;
}
