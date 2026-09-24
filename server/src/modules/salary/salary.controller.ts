import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ListPositionsQueryDto } from './salary.dto.js';
import { SalaryService } from './salary.service.js';

/** Ba route `@Public()` vì không đọc dữ liệu người dùng nào và trang này cần Google vào được — nên PHẢI có hạn mức riêng, thiếu nó là mở cửa quét sạch bảng lương. */
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
