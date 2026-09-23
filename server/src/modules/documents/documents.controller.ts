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
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { streamNdjson } from '../../common/ndjson.js';
import { ThrottleAi } from '../../common/throttle.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import {
  CreateApplicationEmailDto,
  CreateCoverLetterDto,
  CreateCvDto,
  CreateFormAnswerDto,
  JobFromUrlDto,
  ListDocumentsDto,
  PdfQueryDto,
  PreviewBodyDto,
  PreviewQueryDto,
  SetTemplateDto,
  UpdateCvDto,
} from './documents.dto.js';
import { DocumentGenerator } from './services/document-generator.service.js';
import { DocumentsService } from './services/documents.service.js';
import { JobFromUrlService } from './services/job-from-url.service.js';
import { CV_TEMPLATES } from './templates/registry.js';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documents: DocumentsService,
    private readonly generator: DocumentGenerator,
    private readonly queue: QueueService,
    private readonly jobFromUrl: JobFromUrlService,
  ) {}

  @ApiOperation({ summary: 'Lấy danh sách tài liệu của người dùng hiện tại' })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    return this.documents.list(user.id, query.kind, query.jobId, query);
  }

  /** TRẢ VỀ cho người dùng soát chứ không tạo tài liệu luôn: ba ô điền sẵn rẻ hơn một CV sai công ty. */
  @ThrottleAi()
  @ApiOperation({ summary: 'Bóc tin tuyển dụng từ một đường dẫn' })
  @Post('job-from-url')
  extractJob(@CurrentUser() user: AuthUser, @Body() dto: JobFromUrlDto) {
    return this.jobFromUrl.extract(user.id, dto.url);
  }

  /** Phải đứng TRƯỚC `@Get(':id')`, nếu không Nest khớp "cv-templates" vào `:id` rồi trả 404. */
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

  /** Hai header bảo mật là lớp chặn THỨ HAI sau `escapeHtml`: CSP `sandbox` không kèm `allow-scripts`. */
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

  /** POST vì nội dung CV không nhét vừa query string, nhưng vẫn KHÔNG ghi gì vào database. */
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
    await streamNdjson({
      response,
      logger: this.logger,
      label: `sinh tài liệu ${id}`,
      events: this.generator.streamGenerate(user.id, id),
    });
  }

  /** Ba nguồn: tin đã lưu, JD dán tay, hoặc không nhắm vị trí nào ("CV tổng quát"). */
  @ThrottleAi()
  @ApiOperation({ summary: 'Tạo tài liệu CV mới bằng AI' })
  @Post('cv')
  async cv(@CurrentUser() user: AuthUser, @Body() dto: CreateCvDto) {
    const document = await this.documents.createCv(user.id, {
      jobId: dto.jobId,
      jobDescription: dto.jobDescription,
      company: dto.company,
      title: dto.title,
      language: dto.language === 'en' ? 'EN' : 'VI',
    });
    return this.handOff(user.id, document.id, dto.stream);
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
    return this.handOff(user.id, document.id, dto.stream);
  }

  /** Nhận `jobId` của tin có sẵn, HOẶC JD dán tay kèm tên công ty và vị trí — luôn phải có đích. */
  @ThrottleAi()
  @ApiOperation({ summary: 'Tạo tài liệu Mail ứng tuyển mới bằng AI' })
  @Post('application-email')
  async applicationEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationEmailDto,
  ) {
    const document = await this.documents.createApplicationEmail(user.id, dto);
    return this.handOff(user.id, document.id);
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
    return this.handOff(user.id, document.id);
  }

  /** `stream = true` nghĩa là người gọi sẽ tự stream, nên ĐỪNG xếp hàng đợi — xếp nữa là hai lượt gọi model cho một lần bấm. */
  private async handOff(userId: string, documentId: string, stream?: boolean) {
    if (stream) return { queued: false, documentId };
    await this.queue.send(QUEUE.GENERATE_DOCUMENT, { userId, documentId });
    return { queued: true, documentId };
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
    return this.generator.generate(user.id, id);
  }
}
