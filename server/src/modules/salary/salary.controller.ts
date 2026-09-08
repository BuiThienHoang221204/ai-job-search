import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ListPositionsQueryDto } from './salary.dto.js';
import { SalaryService } from './salary.service.js';

/**
 * Tra cứu lương. Ba route đều `@Public()` vì không đọc dữ liệu của người dùng nào
 * và vì trang này về sau cần Google vào được.
 *
 * Công khai thì phải có hạn mức riêng: không có nó thì đây là cửa quét miễn phí
 * toàn bộ bảng lương.
 */
@ApiTags('Salary')
@Controller('salary')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class SalaryController {
  constructor(private readonly salary: SalaryService) {}

  @ApiOperation({ summary: 'Danh mục ngành kèm số vị trí có dữ liệu lương' })
  @Public()
  @Get('occupations')
  occupations() {
    return this.salary.occupations();
  }

  @ApiOperation({ summary: 'Danh sách vị trí kèm khoảng lương' })
  @Public()
  @Get('positions')
  positions(@Query() query: ListPositionsQueryDto) {
    return this.salary.positions(query);
  }

  @ApiOperation({
    summary: 'Chi tiết lương một vị trí, kèm phân tách theo kinh nghiệm',
  })
  @ApiParam({ name: 'slug', example: 'it-software-backend-developer' })
  @Public()
  @Get('positions/:slug')
  position(@Param('slug') slug: string) {
    return this.salary.position(slug);
  }
}
