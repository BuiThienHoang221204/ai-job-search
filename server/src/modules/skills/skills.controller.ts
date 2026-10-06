import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { SkillRegistryService } from './services/skill-registry.service';

@ApiTags('Skills Registry')
@ApiBearerAuth()
@Controller('skills')
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

  @ApiOperation({
    summary: 'Tải lại danh sách kỹ năng từ đĩa SKILL.md (Admin)',
  })
  @Post('reload')
  async reload() {
    await this.registry.reload();
    return { skills: this.registry.list() };
  }
}
