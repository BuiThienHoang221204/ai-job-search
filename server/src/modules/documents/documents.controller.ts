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
