import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';

import { CliIngestAuthGuard } from './cli-ingest-auth.guard';
import { CliIngestTokenService } from './cli-ingest-token.service';
import { CliTokensController } from './cli-tokens.controller';
import { ParseTerminalIngestBatchPipe } from './parse-terminal-ingest-batch.pipe';
import { TerminalBatchesController } from './terminal-batches.controller';
import { TerminalIncidentsController } from './terminal-incidents.controller';
import { TerminalIncidentsService } from './terminal-incidents.service';
import { TerminalIngestService } from './terminal-ingest.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [
    CliTokensController,
    TerminalBatchesController,
    TerminalIncidentsController,
  ],
  providers: [
    CliIngestTokenService,
    TerminalIngestService,
    TerminalIncidentsService,
    CliIngestAuthGuard,
    ParseTerminalIngestBatchPipe,
  ],
})
export class TerminalIngestModule {}
