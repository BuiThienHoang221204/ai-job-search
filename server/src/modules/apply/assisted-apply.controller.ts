import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AssistedApplyService } from './assisted-apply.service.js';

export class LatestAttemptQuery {
  @IsString()
  jobId!: string;
}

/** `jobId` đi trong THÂN, không trong query string. */
export class StartAttemptDto {
  @IsString()
  jobId!: string;
}

/** Assisted Apply. */
@Controller('apply-attempts')
export class AssistedApplyController {
  constructor(private readonly assisted: AssistedApplyService) {}

  /** Đường GHI: xếp một lượt rồi trả biên nhận. */
  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartAttemptDto) {
    return this.assisted.start(user.id, dto.jobId);
  }

  /** Lượt gần nhất của một tin, để giao diện mở lại đúng trạng thái sau khi tải trang. */
  @Get('latest')
  async latest(
    @CurrentUser() user: AuthUser,
    @Query() query: LatestAttemptQuery,
  ) {
    return { attempt: await this.assisted.latest(user.id, query.jobId) };
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assisted.get(user.id, id);
  }

  /** Ảnh chụp trang sau khi điền. */
  @Get(':id/screenshot')
  async screenshot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const png = await this.assisted.screenshot(user.id, id);
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(png);
  }

  @Put(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assisted.confirm(user.id, id);
  }
}
