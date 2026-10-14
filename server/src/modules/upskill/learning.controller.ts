import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { LearningService } from './learning.service';
import { LearningKeyDto, SaveLearningDto } from './upskill.dto';

@ApiTags('Learning Plan')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @ApiOperation({
    summary:
      'Kỹ năng còn thiếu (đếm bằng code trên tin đúng ngành + cấp bậc) kèm kế hoạch học',
  })
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.learning.overview(user.id);
  }

  @ApiOperation({ summary: 'Học hoặc bỏ qua một kỹ năng, lưu mốc và ngày học' })
  @Put(':key')
  save(
    @CurrentUser() user: AuthUser,
    @Param() params: LearningKeyDto,
    @Body() dto: SaveLearningDto,
  ) {
    return this.learning.save(user.id, params.key, dto);
  }

  @ApiOperation({
    summary: 'Bỏ kỹ năng khỏi kế hoạch hoặc khỏi danh sách bỏ qua',
  })
  @Delete(':key')
  remove(@CurrentUser() user: AuthUser, @Param() params: LearningKeyDto) {
    return this.learning.remove(user.id, params.key);
  }
}
