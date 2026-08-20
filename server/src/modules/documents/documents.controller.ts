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
  Length,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
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

/**
 * Mail ứng tuyển nhận MỘT trong hai nguồn tin tuyển dụng, và `@ValidateIf` là
 * chỗ khai điều đó: có `jobId` thì ba trường còn lại bị bỏ qua, không có thì cả
 * ba đều bắt buộc. Nửa bộ dữ liệu (JD nhưng thiếu tên công ty) bị chặn ngay ở
 * đây thay vì để model tự bịa ra phần thiếu.
 */
export class CreateApplicationEmailDto {
  @IsOptional() @IsString() jobId?: string;

  /**
   * Trần 60KB giống `CreateJobDto`: mô tả đi thẳng vào prompt. Sàn 50 ký tự cao
   * hơn sàn 20 của tin tuyển dụng vì một JD ngắn hơn thế không đủ cho model
   * viết mail mà không bịa - còn tin thì chỉ cần đủ để chấm điểm.
   */
  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu mô tả công việc' })
  @Length(50, 60_000, {
    message: 'Mô tả công việc quá ngắn hoặc quá dài (cần 50 tới 60.000 ký tự)',
  })
  jobDescription?: string;

  /*
   * Ba trường này dùng `@Length` thay cho cặp `@MinLength` + `@MaxLength`, và
   * mọi câu báo lỗi đều bằng tiếng Việt. Lý do: giao diện NỐI cả mảng `message`
   * lại rồi hiện lên, mà khi giá trị VẮNG MẶT thì mọi decorator đều hỏng cùng
   * lúc - cặp min/max sẽ nói "quá dài" về một trường còn chưa có gì, và
   * decorator không đặt `message` sẽ chen một câu tiếng Anh vào giữa.
   */
  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu tên công ty' })
  @Length(1, 300, { message: 'Tên công ty phải từ 1 tới 300 ký tự' })
  company?: string;

  @ValidateIf((dto: CreateApplicationEmailDto) => !dto.jobId)
  @IsString({ message: 'Thiếu tên vị trí ứng tuyển' })
  @Length(1, 300, { message: 'Tên vị trí phải từ 1 tới 300 ký tự' })
  title?: string;
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

export class ListDocumentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['CV', 'COVER_LETTER', 'APPLICATION_EMAIL', 'FORM_ANSWER'])
  kind?: 'CV' | 'COVER_LETTER' | 'APPLICATION_EMAIL' | 'FORM_ANSWER';

  /** Chỉ tài liệu đã tạo cho ĐÚNG tin này. */
  @IsOptional() @IsString() jobId?: string;
}

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    return this.documents.list(user.id, query.kind, query.jobId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.get(user.id, id);
  }

  /** Trả về file .tex thô để tải xuống hoặc xem trước. */
  @Get(':id/source')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  source(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.source(user.id, id);
  }

  /** Compile ra PDF rồi trả về bytes. */
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

  /**
   * Mail ứng tuyển. Nhận `jobId` của một tin có sẵn, HOẶC một JD dán tay kèm
   * tên công ty và vị trí - JD dán tay không được lưu thành tin tuyển dụng.
   */
  @ThrottleAi()
  @Post('application-email')
  async applicationEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationEmailDto,
  ) {
    const document = await this.documents.createApplicationEmail(user.id, dto);
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

  /** Render lại `.tex` từ nội dung đã lưu, KHÔNG gọi model. */
  @Put(':id/rerender')
  rerender(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.rerender(user.id, id);
  }

  /** Chạy ngay một tài liệu đã tạo. Dùng để thử nghiệm. */
  @ThrottleAi()
  @Post(':id/generate-sync')
  generateNow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.generate(user.id, id);
  }
}
