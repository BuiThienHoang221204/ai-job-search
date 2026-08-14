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

/**
 * `jobId` đi trong THÂN, không trong query string.
 *
 * Đã trả giá để biết: bản đầu nhận `jobId` qua query nên phía giao diện gọi
 * `api.post(url, null, { params })`. Axios gửi thân là chuỗi `null` kèm
 * `Content-Type: application/json`, và `express.json()` mặc định `strict: true` nên
 * nó TỪ CHỐI mọi thân không phải object/array — người dùng nhận HTTP 400 với câu
 * `Unexpected token 'n', "null" is not valid JSON` hiện thẳng lên màn hình.
 *
 * Test e2e không thể bắt được lỗi đó vì supertest gọi bằng `.query()` mà không gửi
 * thân, tức là nó drive API khác cách client thật drive. Bài học nằm ở đó chứ không
 * ở `strict`.
 */
export class StartAttemptDto {
  @IsString()
  jobId!: string;
}

/**
 * Assisted Apply.
 *
 * KHÔNG có route nào tên `submit`, và không có route nào bấm nút nộp trên trang tuyển
 * dụng. `PUT :id/confirm` chỉ ghi lại việc **người dùng nói rằng họ đã tự nộp** — xem
 * `AssistedApplyService.confirm`.
 */
@Controller('apply-attempts')
export class AssistedApplyController {
  constructor(private readonly assisted: AssistedApplyService) {}

  /**
   * Đường GHI: xếp một lượt rồi trả biên nhận.
   *
   * KHÔNG có `@ThrottleAi()`: trần đó bảo vệ hạn mức model, mà đường này không gọi
   * model — nó chỉ mở một trình duyệt. Nhưng nó tốn 2GB RAM và ~10 giây mỗi lượt, nên
   * chỗ chặn đúng là khoá dedup của hàng đợi (`attemptId`) cộng với việc giao diện
   * không cho bấm khi lượt trước còn chạy.
   */
  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartAttemptDto) {
    return this.assisted.start(user.id, dto.jobId);
  }

  /**
   * Lượt gần nhất của một tin, để giao diện mở lại đúng trạng thái sau khi tải trang.
   *
   * Trả về **một object bọc ngoài** `{ attempt }` chứ không trả thẳng `null`, và đó
   * là bài học trả giá bằng một lượt chạy thật: Nest gửi `null` thành **thân rỗng**
   * kèm HTTP 200 và không có `Content-Type`, nên axios ở phía giao diện đổ
   * `Unexpected token 'n', "null" is not valid JSON` — một thông báo chẳng liên quan
   * gì tới nguyên nhân, hiện thẳng lên màn hình người dùng.
   *
   * Cách khác là trả 404 khi chưa có lượt nào, nhưng đó chính là vết đã có ở
   * `GET /api/upskill`: giao diện không phân biệt được "chưa có" với "route đã bị đổi
   * tên", và console đầy 404 hợp lệ. Một object luôn parse được thì không có chỗ nào
   * để nhầm.
   */
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

  /**
   * Ảnh chụp trang sau khi điền.
   *
   * `StreamableFile` chứ không trả `Buffer`: Nest đem Buffer qua bộ serialize JSON và
   * cho ra `{"type":"Buffer","data":[...]}` với HTTP 200 và content-type đúng — một
   * file hỏng trông y như file tốt. Đã trả giá đúng lỗi này ở đường PDF.
   */
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
      // Ảnh gắn với một lượt chạy đã xong nên nó không đổi nữa; cho cache lâu để
      // người dùng cuộn qua lại không tải lại vài trăm KB mỗi lần.
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(png);
  }

  @Put(':id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assisted.confirm(user.id, id);
  }
}
