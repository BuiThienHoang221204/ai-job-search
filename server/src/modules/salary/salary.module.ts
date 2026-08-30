import { Module } from '@nestjs/common';
import { SalaryController } from './salary.controller.js';
import { SalaryService } from './salary.service.js';

@Module({
  controllers: [SalaryController],
  providers: [SalaryService],
  exports: [SalaryService],
})
export class SalaryModule {}
