import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SkillRegistryService } from './skill-registry.service.js';

/// Công cụ vận hành, không phải dữ liệu người dùng: danh sách skill để lộ tên và
/// hash của khung prompt đang chạy, còn `reload` buộc máy chủ đọc lại đĩa. Vì
/// vậy cả hai route đều chỉ dành cho ADMIN - trước đây controller này không có
/// guard nào, ai cũng gọi được kể cả chưa đăng nhập.
///
/// Chỉ khai RolesGuard: `JwtAuthGuard` là APP_GUARD toàn cục và luôn chạy
/// trước guard của controller, nên `request.user` đã có sẵn khi tới đây.
@Controller('skills')
@UseGuards(RolesGuard)
@Roles('ADMIN')
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
