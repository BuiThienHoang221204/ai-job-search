import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  StreamableFile,
  Param,
  Logger,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import {
  DocumentsService,
  type PdfEngine,
} from './services/documents.service.js';
import { ThrottleAi } from '../../common/throttle.js';
import { CV_TEMPLATES } from './templates/registry.js';

export class CreateCvDto {
  @IsOptional() @IsString() jobId?: string;

  /**
   * Người gọi sẽ tự stream bằng `POST :id/generate-stream`, nên ĐỪNG xếp hàng
   * đợi. Thiếu cờ này thì cả worker lẫn stream cùng sinh một tài liệu - hai lượt
   * gọi model cho một lần bấm, và bản ghi bị hai tiến trình cùng ghi đè.
   */
  @IsOptional() @IsBoolean() stream?: boolean;
}

/** Chọn đường sinh PDF. `@IsIn` để chuỗi lạ bị báo lỗi thay vì rơi về mặc định. */
export class PdfQueryDto {
  @IsOptional() @IsIn(['latex', 'html']) engine?: PdfEngine;
}

/**
 * Bản CV người dùng vừa sửa.
 *
 * `content` và `layout` để `unknown` ở đây rồi cho zod kiểm trong service, thay vì
 * dựng lại cả cây DTO bằng class-validator: hình dạng đã khai một lần ở
 * `cvEditSchema` và `resolveLayout`, khai lần hai là hai bản sẽ trôi khỏi nhau.
 */
export class UpdateCvDto {
  @IsOptional() @IsObject() content?: unknown;
  @IsOptional() @IsObject() layout?: unknown;
}

/** Xem trước bản nháp CHƯA lưu. Thiếu trường nào thì lấy bản đã lưu cho trường đó. */
export class PreviewBodyDto extends UpdateCvDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

/** Xem trước một mẫu mà KHÔNG lưu. Bỏ trống thì xem đúng mẫu đang lưu. */
export class PreviewQueryDto {
  @IsOptional() @IsString() @Length(1, 40) templateId?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

/**
 * Đổi mẫu trình bày của CV. `templateId` do service tra trong `templates/registry.ts`,
 * không chép danh sách vào đây; `accent` chặn bằng regex vì nó đi thẳng vào CSS.
 */
export class SetTemplateDto {
  @IsString() @Length(1, 40) templateId!: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accent phải có dạng #rrggbb' })
  accent?: string;
}

export class CreateCoverLetterDto {
  @IsString() jobId!: string;

  /** Xem docblock của `CreateCvDto.stream`. */
  @IsOptional() @IsBoolean() stream?: boolean;
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

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documents: DocumentsService,
    private readonly queue: QueueService,
  ) {}

  @ApiOperation({ summary: 'Lấy danh sách tài liệu của người dùng hiện tại' })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    return this.documents.list(user.id, query.kind, query.jobId, query);
  }

  /**
   * Danh mục mẫu CV. Phải đứng TRƯỚC `@Get(':id')`, nếu không Nest khớp
   * "cv-templates" vào `:id` và trả 404 "không tìm thấy tài liệu".
   */
  @ApiOperation({ summary: 'Lấy danh mục các mẫu CV hiện có' })
  @Get('cv-templates')
  templates() {
    return { items: CV_TEMPLATES };
  }

  @ApiOperation({ summary: 'Lấy chi tiết tài liệu theo ID' })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.get(user.id, id);
  }

  /** Trả về file .tex thô để tải xuống hoặc xem trước. */
  @ApiOperation({ summary: 'Lấy mã nguồn LaTeX (.tex) của tài liệu' })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
  @Get(':id/source')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  source(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.source(user.id, id);
  }

  /** Đổi mẫu trình bày của CV. Không `@ThrottleAi()` vì route này không gọi model. */
  @ApiOperation({ summary: 'Cập nhật mẫu trình bày (template) cho CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Put(':id/template')
  setTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetTemplateDto,
  ) {
    return this.documents.setTemplate(user.id, id, dto.templateId, dto.accent);
  }

  /**
   * Bản HTML của CV để nhúng vào khung xem trước. Hai header bảo mật là lớp chặn
   * thứ hai sau `escapeHtml`: CSP `sandbox` không kèm `allow-scripts`.
   */
  @ApiOperation({ summary: 'Lấy bản xem trước HTML của CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Get(':id/preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', 'sandbox')
  @Header('X-Frame-Options', 'SAMEORIGIN')
  preview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PreviewQueryDto,
  ) {
    return this.documents.previewHtml(user.id, id, query);
  }

  /**
   * Xem trước bản nháp chưa lưu. POST vì nội dung CV không nhét vừa query string,
   * nhưng vẫn KHÔNG ghi gì vào database.
   */
  @ApiOperation({ summary: 'Xem trước bản nháp HTML chưa lưu của CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Post(':id/preview')
  // 200 chứ không phải 201 mặc định của Nest: route này KHÔNG tạo ra gì.
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', 'sandbox')
  @Header('X-Frame-Options', 'SAMEORIGIN')
  previewDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewBodyDto,
  ) {
    return this.documents.previewHtml(user.id, id, dto);
  }

  /** Lưu bản CV người dùng đã sửa. Không gọi model. */
  @ApiOperation({ summary: 'Lưu nội dung chỉnh sửa của CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Put(':id/cv')
  updateCv(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCvDto,
  ) {
    return this.documents.updateCv(user.id, id, dto);
  }

  /** Tạo PDF rồi trả về bytes. `engine=html` đi đường mẫu HTML, mặc định là LaTeX. */
  @ApiOperation({ summary: 'Tải file PDF của tài liệu' })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: PdfQueryDto,
  ): Promise<StreamableFile> {
    const pdf = await this.documents.pdf(user.id, id, query.engine ?? 'latex');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'inline; filename="document.pdf"',
    });
  }

  @ThrottleAi()
  @ApiOperation({ summary: 'Tạo tài liệu CV mới bằng AI' })
  @ThrottleAi()
  @ApiOperation({
    summary: 'Sinh CV và đẩy về từng phần ngay khi AI viết ra (NDJSON)',
  })
  @ApiParam({ name: 'id', description: 'ID của tài liệu đã tạo' })
  @Post(':id/generate-stream')
  async generateStream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    try {
      for await (const event of this.documents.streamGenerate(user.id, id)) {
        response.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      this.logger.error(
        `Stream sinh tài liệu ${id} hỏng: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.destroy();
      return;
    }

    response.end();
  }

  @Post('cv')
  async cv(@CurrentUser() user: AuthUser, @Body() dto: CreateCvDto) {
    const document = await this.documents.create(
      user.id,
      'CV',
      dto.jobId ? 'CV theo vị trí' : 'CV tổng quát',
      dto.jobId,
    );
    if (dto.stream) return { queued: false, documentId: document.id };

    await this.queue.send(QUEUE.GENERATE_DOCUMENT, {
      userId: user.id,
      documentId: document.id,
    });
    return { queued: true, documentId: document.id };
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo tài liệu Thư xin việc (Cover Letter) mới bằng AI',
  })
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
    if (dto.stream) return { queued: false, documentId: document.id };

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
  @ApiOperation({ summary: 'Tạo tài liệu Mail ứng tuyển mới bằng AI' })
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
  @ApiOperation({
    summary: 'Tạo tài liệu Trả lời câu hỏi ứng tuyển mới bằng AI',
  })
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
  @ApiOperation({ summary: 'Render lại mã LaTeX của tài liệu' })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
  @Put(':id/rerender')
  rerender(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.rerender(user.id, id);
  }

  /** Chạy ngay một tài liệu đã tạo. Dùng để thử nghiệm. */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo tài liệu đồng bộ ngay lập tức (không qua hàng đợi)',
  })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
  @Post(':id/generate-sync')
  generateNow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.generate(user.id, id);
  }
}
