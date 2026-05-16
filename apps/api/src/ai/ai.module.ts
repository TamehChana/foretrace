import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { RiskInsightService } from './risk-insight.service';
import { TraceAnalystContextService } from './trace-analyst-context.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [RiskInsightService, TraceAnalystContextService],
  exports: [RiskInsightService, TraceAnalystContextService],
})
export class AiModule {}
