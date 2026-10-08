import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { streamNdjson } from '@/common/ndjson';
import { ThrottleAi } from '@/common/throttle';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { withFailureKind, withFailureKinds } from '../ai/utils/failure-view';
import { cvPdfErrorMessage } from './cv-pdf.source';
import { MAX_PDF_BYTES } from './utils/pdf-text';
import { ProfileDraftService } from './services/profile-draft.service';
import { ProfileSynthesizerService } from './services/profile-synthesizer.service';
import { ApplyDraftDto } from './profile-draft.dto';

@ApiTags('Profile Drafts (CV Upload)')
@ApiBearerAuth()
@Controller('profile-drafts')
export class ProfileDraftController {
  private readonly logger = new Logger(ProfileDraftController.name);

  constructor(
    private readonly drafts: ProfileDraftService,
    private readonly synthesizer: ProfileSynthesizerService,
  ) {}

  @ThrottleAi()
  @ApiOperation({ summary: 'Nộp file CV PDF để AI trích xuất thông tin hồ sơ' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('cv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES, files: 1 } }),
  )
  async uploadCv(
    @CurrentUser() user: AuthUser,
    @Query('stream') stream?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Chưa có file nào được nộp. Gửi dưới dạng multipart với tên trường "file".',
      );
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException(
        `Chỉ nhận file PDF. File vừa nộp khai là "${file.mimetype}".`,
      );
    }

    try {
      const { draftId, evidence } = await this.drafts.createFromCv(
        user.id,
        {
          data: file.buffer,
          filename: file.originalname,
        },
        stream === 'true',
      );

      return {
        draftId,
        queued: stream !== 'true',
        extracted: evidence.map((item) => item.meta),
      };
    } catch (error) {
      const message = cvPdfErrorMessage(error);
      if (message === null) throw error;
      throw new BadRequestException(message);
    }
  }

  @ApiOperation({
    summary: 'Lấy bản nháp hồ sơ mới nhất đang xử lý hoặc đã hoàn thành',
  })
  @Get('latest')
  async latest(@CurrentUser() user: AuthUser) {
    return withFailureKind(await this.drafts.latest(user.id));
  }

  @ApiOperation({ summary: 'Lấy lịch sử các lượt tải lên CV và trích xuất' })
  @Get('history')
  async history(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    const page = await this.drafts.history(user.id, query);
    return { ...page, items: withFailureKinds(page.items) };
  }

  @ApiOperation({ summary: 'Tải xuống hoặc xem file CV PDF gốc đã nộp' })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Get(':id/file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { data, filename } = await this.drafts.file(user.id, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(data.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(data);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một bản nháp hồ sơ theo ID' })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.drafts.get(user.id, id));
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Đọc CV và đẩy về từng phần ngay khi AI viết ra (NDJSON)',
  })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Post(':id/synthesize-stream')
  async synthesizeStream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.drafts.get(user.id, id);

    await streamNdjson({
      response,
      logger: this.logger,
      label: `đọc CV ${id}`,
      events: this.synthesizer.streamSynthesize(id),
      onAbandon: () => void this.drafts.requeue(user.id, id),
    });
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Thử lại tiến trình trích xuất bản nháp hồ sơ bị lỗi',
  })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Post(':id/retry')
  @HttpCode(200)
  async retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.drafts.retry(user.id, id));
  }

  @ApiOperation({
    summary: 'Lưu vào hồ sơ các giá trị người dùng đã duyệt từ bản đọc CV',
  })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Put(':id/apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApplyDraftDto,
  ) {
    return this.drafts.apply(user.id, id, dto);
  }
}
