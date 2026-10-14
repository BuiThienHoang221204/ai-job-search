import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { UpskillModule } from '../upskill/upskill.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ApplicationsModule, UpskillModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
