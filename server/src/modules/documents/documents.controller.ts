import {
  Body,
  Controller,
  Get,
  Header,
  StreamableFile,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { DocumentsService } from './documents.service.js';
import { ThrottleAi } from '../../common/throttle.js';

export class CreateCvDto {
  @IsOptional() @IsString() jobId?: string;
}

export class CreateCoverLetterDto {
  @IsString() jobId!: string;
}

export class CreateFormAnswerDto {
  @IsString()
  @MinLength(5, { message: 'Câu hỏi quá ngắn' })
  question!: string;

  @IsOptional() @IsString() jobId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(5000)
  characterLimit?: number;
}

export class ListDocumentsDto {
  @IsOptional()
  @IsIn(['CV', 'COVER_LETTER', 'FORM_ANSWER'])
  kind?: 'CV' | 'COVER_LETTER' | 'FORM_ANSWER';
}

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    return this.documents.list(user.id, query.kind);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.get(user.id, id);
  }

  /// Trả về file .tex thô để tải xuống hoặc xem trước.
  @Get(':id/source')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  source(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.source(user.id, id);
  }

  /**
   * Compile ra PDF rồi trả về bytes.
   *
   * Đồng bộ, không qua hàng đợi: đã đo được compile mất khoảng 5 giây — đủ nhanh để
   * người dùng chờ, và đưa vào hàng đợi sẽ cần thêm một bảng trạng thái cùng một
   * vòng hỏi lại ở giao diện để đổi lấy 5 giây.
   *
   * `Content-Disposition: inline` để trình duyệt MỞ trong tab thay vì tải về ngay:
   * người dùng cần xem CV trước khi gửi đi, và tải về là một cú bấm nữa trong chính
   * khung xem PDF của trình duyệt.
   *
   * **Phải là `StreamableFile`, KHÔNG được trả `Buffer` trực tiếp.** Bản đầu trả
   * Buffer kèm hai decorator `@Header`, và nó "chạy": HTTP 200, 113KB, content-type
   * đúng `application/pdf`. Nhưng thân phản hồi là
   *
   *   {"type":"Buffer","data":[37,80,68,70,...]}
   *
   * — Nest đem Buffer qua bộ serialize JSON. Một file PDF hỏng mang đúng mã 200 và
   * đúng content-type, nên chỉ mở byte đầu ra xem mới phát hiện được.
   */
  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const pdf = await this.documents.pdf(user.id, id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'inline; filename="document.pdf"',
    });
  }

  @ThrottleAi()
  @Post('cv')
  async cv(@CurrentUser() user: AuthUser, @Body() dto: CreateCvDto) {
    const document = await this.documents.create(
      user.id,
      'CV',
      dto.jobId ? 'CV theo vị trí' : 'CV tổng quát',
      dto.jobId,
    );
    await this.queue.send(QUEUE.GENERATE_DOCUMENT, {
      userId: user.id,
      documentId: document.id,
    });
    return { queued: true, documentId: document.id };
  }

  @ThrottleAi()
  @Post('cover-letter')
  async coverLetter(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCoverLetterDto,
  ) {
    const document = await this.documents.create(
      user.id,
      'COVER_LETTER',
      'Thư xin việc',
      dto.jobId,
    );
    await this.queue.send(QUEUE.GENERATE_DOCUMENT, {
      userId: user.id,
      documentId: document.id,
    });
    return { queued: true, documentId: document.id };
  }

  @ThrottleAi()
  @Post('form-answer')
  async formAnswer(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFormAnswerDto,
  ) {
    const document = await this.documents.create(
      user.id,
      'FORM_ANSWER',
      dto.question.slice(0, 120),
      dto.jobId,
      { question: dto.question, characterLimit: dto.characterLimit },
    );
    await this.queue.send(QUEUE.GENERATE_DOCUMENT, {
      userId: user.id,
      documentId: document.id,
    });
    return { queued: true, documentId: document.id };
  }

  /**
   * Render lại `.tex` từ nội dung đã lưu, KHÔNG gọi model.
   *
   * Cố ý KHÔNG có `@ThrottleAi()`: trần đó bảo vệ hạn mức gọi model, mà đường này
   * không gọi model nào. Bắt nó chịu trần 10 lần/phút sẽ chặn đúng việc mà người vận
   * hành cần làm hàng loạt sau khi sửa template.
   *
   * `PUT` chứ không `POST`: chạy hai lần cho cùng một tài liệu ra đúng một kết quả,
   * vì render là hàm tất định của `content`.
   */
  @Put(':id/rerender')
  rerender(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.rerender(user.id, id);
  }

  /// Chạy ngay một tài liệu đã tạo. Dùng để thử nghiệm.
  @ThrottleAi()
  @Post(':id/generate-sync')
  generateNow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.generate(user.id, id);
  }
}
