import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProjectImpactAnalyzerService } from '../ai/project-impact-analyzer.service';
import { AiModule } from '../ai/ai.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectRiskService } from '../projects/project-risk.service';
import { ProjectSignalsService } from '../projects/project-signals.service';
import { ProjectsModule } from '../projects/projects.module';
import { DefenseDemoSeedService } from './defense-demo.seed';

/**
 * Lightweight Nest context for `npm run seed:defense`.
 * ConfigModule.forRoot mirrors AppModule so RiskMlService / insights see env.
 * Explicit factory avoids tsx decorator-metadata injection gaps.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    ProjectsModule,
    AlertsModule,
    AiModule,
    AuditModule,
  ],
  providers: [
    {
      provide: DefenseDemoSeedService,
      useFactory: (
        prisma: PrismaService,
        signals: ProjectSignalsService,
        risk: ProjectRiskService,
        impactAnalyzer: ProjectImpactAnalyzerService,
      ) => new DefenseDemoSeedService(prisma, signals, risk, impactAnalyzer),
      inject: [
        PrismaService,
        ProjectSignalsService,
        ProjectRiskService,
        ProjectImpactAnalyzerService,
      ],
    },
  ],
  exports: [DefenseDemoSeedService],
})
export class DefenseDemoSeedModule {}
