import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RiskInsightService } from './risk-insight.service';

@Module({
  imports: [ConfigModule],
  providers: [RiskInsightService],
  exports: [RiskInsightService],
})
export class AiModule {}
