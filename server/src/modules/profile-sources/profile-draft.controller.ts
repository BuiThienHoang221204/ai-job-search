import {
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { streamNdjson } from '@/common/ndjson';
import { ThrottleAi } from '@/common/throttle';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { withFailureKind } from '@/common/ai/failure-view';
import { ProfileDraftService } from './services/profile-draft.service';
import { ProfileSynthesizerService } from './services/profile-synthesizer.service';
import { ApplyDraftDto, ConfirmCvUploadDto } from './profile-draft.dto';

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
  @ApiOperation({
    summary: 'Xin URL để trình duyệt tải CV PDF thẳng lên kho lưu trữ',
  })
  @Post('cv/upload-url')
  uploadUrl(@CurrentUser() user: AuthUser) {
    return this.drafts.uploadUrl(user.id);
  }

  @ThrottleAi()
  @ApiOperation({
    summary:
      'Đọc CV PDF vừa tải lên kho lưu trữ để AI trích xuất thông tin hồ sơ',
  })
  @Post('cv')
  uploadCv(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmCvUploadDto,
    @Query('stream') stream?: string,
  ) {
    return this.drafts.createFromUpload(user.id, dto, stream === 'true');
  }

  @ApiOperation({
    summary: 'Lấy bản nháp hồ sơ mới nhất đang xử lý hoặc đã hoàn thành',
  })
  @Get('latest')
  async latest(@CurrentUser() user: AuthUser) {
    return withFailureKind(await this.drafts.latest(user.id));
  }

  @ApiOperation({
    summary: 'Chuyển tới link tải trực tiếp file CV PDF gốc đã nộp',
  })
  @ApiParam({ name: 'id', description: 'ID của bản nháp hồ sơ' })
  @Get(':id/file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(await this.drafts.fileUrl(user.id, id));
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
    await streamNdjson({
      response,
      logger: this.logger,
      label: `đọc CV ${id}`,
      events: this.synthesizer.streamSynthesize(user.id, id),
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
