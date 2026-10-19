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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { streamNdjson } from '@/common/ndjson';
import { ThrottleAi, ThrottlePdf } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import { QUEUE, QueueService } from '../queue/queue.service';
import {
  CreateApplicationEmailDto,
  CreateCoverLetterDto,
  CreateCvDto,
  JobFromUrlDto,
  ListDocumentsDto,
  PreviewBodyDto,
  SetTemplateDto,
  UpdateCvDto,
} from './documents.dto';
import { DocumentGenerator } from './services/document-generator.service';
import { DocumentsService } from './services/documents.service';
import { JobFromUrlService } from './services/job-from-url.service';
import { CV_TEMPLATES } from './templates/registry';
import { withFailureKind } from '@/common/ai/failure-view';

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
  async list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    const page = await this.documents.list(
      user.id,
      query.kind,
      query.jobId,
      query,
    );
    return { ...page, items: page.items.map(withFailureKind) };
  }

  @ThrottleAi()
  @ApiOperation({ summary: 'Bóc tin tuyển dụng từ một đường dẫn' })
  @Post('job-from-url')
  extractJob(@CurrentUser() user: AuthUser, @Body() dto: JobFromUrlDto) {
    return this.jobFromUrl.extract(user.id, dto.url);
  }

  @ApiOperation({ summary: 'Lấy danh mục các mẫu CV hiện có' })
  @Get('cv-templates')
  templates() {
    return { items: CV_TEMPLATES };
  }

  @ApiOperation({ summary: 'Lấy chi tiết tài liệu theo ID' })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.documents.get(user.id, id));
  }

  @ApiOperation({ summary: 'Cập nhật mẫu trình bày (template) cho CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Put(':id/template')
  async setTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetTemplateDto,
  ) {
    return withFailureKind(
      await this.documents.setTemplate(user.id, id, dto.templateId, dto),
    );
  }

  @ApiOperation({ summary: 'Xem trước bản nháp HTML chưa lưu của CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Post(':id/preview')
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

  @ApiOperation({ summary: 'Lưu nội dung chỉnh sửa của CV' })
  @ApiParam({ name: 'id', description: 'ID của CV' })
  @Put(':id/cv')
  async updateCv(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCvDto,
  ) {
    return withFailureKind(await this.documents.updateCv(user.id, id, dto));
  }

  @ThrottlePdf()
  @ApiOperation({ summary: 'Tải file PDF của tài liệu' })
  @ApiParam({ name: 'id', description: 'ID của tài liệu' })
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

  private async handOff(userId: string, documentId: string, stream?: boolean) {
    if (stream) return { queued: false, documentId };
    await this.queue.send(QUEUE.GENERATE_DOCUMENT, { userId, documentId });
    return { queued: true, documentId };
  }
}
