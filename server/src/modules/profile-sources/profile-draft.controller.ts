import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { ThrottleAi } from '../../common/throttle.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { withFailureKind, withFailureKinds } from '../ai/failure-view.js';
import { cvPdfErrorMessage } from './cv-pdf.source.js';
import { MAX_PDF_BYTES } from './pdf-text.js';
import { ProfileDraftService } from './services/profile-draft.service.js';

export class ApplyDraftDto {
  /** Tên các trường người dùng đã tích ở màn xác nhận. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  fields!: string[];
}

@ApiTags('Profile Drafts (CV Upload)')
@ApiBearerAuth()
@Controller('profile-drafts')
export class ProfileDraftController {
  constructor(private readonly drafts: ProfileDraftService) {}

  /** Nộp CV PDF. */
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
      const { draftId, evidence } = await this.drafts.createFromCv(user.id, {
        data: file.buffer,
        filename: file.originalname,
      });

      return {
        draftId,
        queued: true,
        /**
         * Trả lại số liệu trích xuất ngay trong response: người dùng biết được hệ
         * thống đọc ra bao nhiêu chữ TRƯỚC khi model chạy xong. Một CV 6 trang chỉ
         * ra 400 ký tự là dấu hiệu rất rõ ràng, và nói ngay thì đỡ hơn để họ chờ
         */
        extracted: evidence.map((item) => item.meta),
      };
    } catch (error) {
      const message = cvPdfErrorMessage(error);
      if (message === null) throw error;
      throw new BadRequestException(message);
    }
  }

  /** Bản nháp mới nhất — màn Upload đọc cái này để theo tiến trình. */
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

  /** File CV gốc đã nộp. Dùng `StreamableFile`, KHÔNG trả `Buffer` trực tiếp. */
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

  /**
   * Đặt SAU 'latest' và 'history': route tĩnh phải khai trước route tham số, nếu
   * không Nest sẽ khớp `/latest` vào `:id`.
   */
  @ApiOperation({ summary: 'Lấy chi tiết một bản nháp hồ sơ theo ID' })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.drafts.get(user.id, id));
  }

  /** Chạy lại một bản nháp đã hỏng, dùng lại bằng chứng đã lưu. */
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

  /** Áp dụng những trường người dùng đã chọn vào hồ sơ thật. */
  @ApiOperation({
    summary:
      'Áp dụng các trường thông tin đã trích xuất từ CV vào hồ sơ chính thức',
  })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Put(':id/apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApplyDraftDto,
  ) {
    return this.drafts.apply(user.id, id, dto.fields);
  }
}
