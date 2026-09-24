import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Put,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import {
  MergeSkillDto,
  MoveAliasDto,
  RenameSkillDto,
  SkillsQueryDto,
} from '../admin.dto.js';
import { AdminSkillsService } from '../services/admin-skills.service.js';

/** Máy đọc danh bạ qua cache 60 giây mỗi tiến trình, nên sửa ở đây có hiệu lực chậm nhất sau một phút. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/skills')
@Roles('ADMIN')
export class AdminSkillsController {
  constructor(private readonly skills: AdminSkillsService) {}

  @ApiOperation({ summary: 'Số kỹ năng chuẩn và số cách viết theo nguồn' })
  @Get('summary')
  summary() {
    return this.skills.summary();
  }

  @ApiOperation({
    summary: 'Danh sách kỹ năng chuẩn, tìm theo tên hoặc cách viết',
  })
  @Get()
  list(@Query() query: SkillsQueryDto) {
    return this.skills.list(query);
  }

  @ApiOperation({
    summary:
      'Chi tiết kỹ năng, mọi cách viết và kỹ năng gần nhất theo embedding',
  })
  @ApiParam({ name: 'id', description: 'ID kỹ năng chuẩn' })
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.skills.detail(id);
  }

  @ApiOperation({ summary: 'Đổi tên hiển thị của kỹ năng chuẩn' })
  @ApiParam({ name: 'id', description: 'ID kỹ năng chuẩn' })
  @Put(':id')
  rename(@Param('id') id: string, @Body() dto: RenameSkillDto) {
    return this.skills.rename(id, dto.name);
  }

  /** Khoá alias đi trong body: `c++`, `c#`, `node/express` không đi an toàn trên đường dẫn. */
  @ApiOperation({ summary: 'Chuyển một cách viết sang kỹ năng chuẩn khác' })
  @Post('aliases/move')
  @HttpCode(200)
  moveAlias(@Body() dto: MoveAliasDto) {
    return this.skills.moveAlias(dto.key, dto.skillId);
  }

  @ApiOperation({ summary: 'Gộp kỹ năng này vào kỹ năng đích rồi xoá nó' })
  @ApiParam({ name: 'id', description: 'ID kỹ năng bị gộp' })
  @Post(':id/merge')
  @HttpCode(200)
  merge(@Param('id') id: string, @Body() dto: MergeSkillDto) {
    return this.skills.merge(id, dto.targetId);
  }

  @ApiOperation({
    summary: 'Xếp hàng đối chiếu lại toàn kho theo danh bạ hiện tại',
  })
  @Post('rematch')
  @HttpCode(202)
  rematch() {
    return this.skills.rematchAll();
  }
}
