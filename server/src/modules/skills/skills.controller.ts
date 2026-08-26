import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SkillRegistryService } from './services/skill-registry.service.js';

/**
 * Công cụ vận hành, không phải dữ liệu người dùng: danh sách skill để lộ tên và
 * hash của khung prompt đang chạy, còn `reload` buộc máy chủ đọc lại đĩa. Vì
 * vậy cả hai route đều chỉ dành cho ADMIN - trước đây controller này không có
 */
@ApiTags('Skills Registry')
@ApiBearerAuth()
@Controller('skills')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class SkillsController {
  constructor(private readonly registry: SkillRegistryService) {}

  @ApiOperation({
    summary:
      'Lấy danh sách các kỹ năng/skills định nghĩa trong hệ thống (Admin)',
  })
  @Get()
  list() {
    return { skills: this.registry.list() };
  }

  /**
   * Nạp lại skill từ đĩa mà không phải khởi động lại server - để sửa SKILL.md
   * rồi thử ngay.
   */
  @ApiOperation({
    summary: 'Tải lại danh sách kỹ năng từ đĩa SKILL.md (Admin)',
  })
  @Post('reload')
  async reload() {
    await this.registry.reload();
    return { skills: this.registry.list() };
  }
}
