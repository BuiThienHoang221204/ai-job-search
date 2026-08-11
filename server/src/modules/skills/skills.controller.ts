import { Controller, Get, Post } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service.js';

@Controller('skills')
export class SkillsController {
  constructor(private readonly registry: SkillRegistryService) {}

  @Get()
  list() {
    return { skills: this.registry.list() };
  }

  /// Nạp lại skill từ đĩa mà không phải khởi động lại server - để sửa SKILL.md
  /// rồi thử ngay.
  @Post('reload')
  async reload() {
    await this.registry.reload();
    return { skills: this.registry.list() };
  }
}
