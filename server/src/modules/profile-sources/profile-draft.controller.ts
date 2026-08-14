import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';
import { ThrottleAi } from '../../common/throttle.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { withFailureKind, withFailureKinds } from '../ai/failure-view.js';
import { cvPdfErrorMessage } from './cv-pdf.source.js';
import { MAX_PDF_BYTES } from './pdf-text.js';
import { ProfileDraftService } from './profile-draft.service.js';

export class ApplyDraftDto {
  /// Tên các trường người dùng đã tích ở màn xác nhận.
  ///
  /// `ArrayNotEmpty` chứ không cho mảng rỗng: gửi lên mảng rỗng gần như luôn là bug
  /// ở frontend, và nếu chấp nhận thì nó lặng lẽ đánh dấu bản nháp là "đã áp dụng"
  /// mà không đổi gì trong hồ sơ.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  fields!: string[];
}

@Controller('profile-drafts')
export class ProfileDraftController {
  constructor(private readonly drafts: ProfileDraftService) {}

  /**
   * Nộp CV PDF.
   *
   * `limits.fileSize` là chặn ở tầng multer, TRƯỚC khi cả file vào bộ nhớ — khác
   * với phép kiểm trong `extractPdfText`, thứ chỉ chạy khi buffer đã nằm sẵn trong
   * RAM. Cần cả hai: multer bảo vệ tiến trình, phép kiểm kia bảo vệ hàm khi được
   * gọi từ chỗ khác (worker, test, nguồn khác sau này).
   *
   * `@ThrottleAi()` vì mỗi lần nộp thành công đều xếp một lượt gọi model.
   */
  @ThrottleAi()
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

    /*
     * Kiểm cả mimetype LẪN đuôi file, nhưng không tin cả hai.
     *
     * `mimetype` do trình duyệt gửi lên nên người dùng đổi được; nó chỉ để trả lời
     * nhanh cho trường hợp nộp nhầm ảnh. Phép kiểm THẬT là `extractPdfText`, thứ
     * đọc header và cấu trúc file — nó ném 'INVALID' cho bất cứ gì không phải PDF,
     * bất kể mimetype ghi gì.
     */
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
        /// Trả lại số liệu trích xuất ngay trong response: người dùng biết được hệ
        /// thống đọc ra bao nhiêu chữ TRƯỚC khi model chạy xong. Một CV 6 trang chỉ
        /// ra 400 ký tự là dấu hiệu rất rõ ràng, và nói ngay thì đỡ hơn để họ chờ
        /// 90 giây rồi mới thấy kết quả nghèo nàn.
        extracted: evidence.map((item) => item.meta),
      };
    } catch (error) {
      const message = cvPdfErrorMessage(error);
      // `null` nghĩa là lỗi này không thuộc khâu đọc PDF — ném tiếp để filter lỗi
      // toàn cục xử lý, thay vì che nó thành "file PDF không hợp lệ".
      if (message === null) throw error;
      throw new BadRequestException(message);
    }
  }

  /// Bản nháp mới nhất — màn Upload đọc cái này để theo tiến trình.
  @Get('latest')
  async latest(@CurrentUser() user: AuthUser) {
    return withFailureKind(await this.drafts.latest(user.id));
  }

  @Get('history')
  async history(@CurrentUser() user: AuthUser) {
    return withFailureKinds(await this.drafts.history(user.id));
  }

  /// Đặt SAU 'latest' và 'history': route tĩnh phải khai trước route tham số, nếu
  /// không Nest sẽ khớp `/latest` vào `:id`.
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.drafts.get(user.id, id));
  }

  /// Áp dụng những trường người dùng đã chọn vào hồ sơ thật.
  @Put(':id/apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApplyDraftDto,
  ) {
    return this.drafts.apply(user.id, id, dto.fields);
  }
}
