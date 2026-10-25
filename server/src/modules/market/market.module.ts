import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

@Module({
  imports: [MatchingModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
