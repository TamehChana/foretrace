import type { TerminalIncidentCategory } from '@prisma/client';
import { Injectable, BadRequestException } from '@nestjs/common';

import type { TerminalIngestBatchInput } from '@foretrace/shared';

import { PrismaService } from '../prisma/prisma.service';
import { ProjectSignalsService } from '../projects/project-signals.service';
import {
  classifyTerminalLine,
  isLikelySignalLine,
  normalizeForFingerprint,
} from './terminal-classify';
import { sha256Utf8Hex } from './terminal-digest';
import { redactTerminalLine } from './terminal-redact';

export interface CliTokenContext {
  tokenId: string;
  organizationId: string;
  projectId: string;
}

/** Max fingerprints processed per batch to cap DB churn. */
const MAX_SIGNAL_LINES_PER_BATCH = 80;

@Injectable()
export class TerminalIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectSignals: ProjectSignalsService,
  ) {}

  private fingerprintFor(
    category: TerminalIncidentCategory,
    normalizedLine: string,
    taskKey: string,
  ): string {
    const payload = `${taskKey}|${category}|${normalizedLine}`;
    return sha256Utf8Hex(payload).slice(0, 128);
  }

  async ingest(
    dto: TerminalIngestBatchInput,
    ctx: CliTokenContext,
  ): Promise<{
    batchId: string;
    linesStored: number;
    incidentsUpserted: number;
  }> {
    if (dto.taskId) {
      const taskInProject = await this.prisma.task.findFirst({
        where: { id: dto.taskId, projectId: ctx.projectId },
        select: { id: true },
      });
      if (!taskInProject) {
        throw new BadRequestException('taskId is not part of this project');
      }
    }

    const redactedLines = dto.lines.map((raw) =>
      redactTerminalLine(typeof raw === 'string' ? raw : String(raw)),
    );

    const batch = await this.prisma.terminalIngestBatch.create({
      data: {
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        taskId: dto.taskId ?? null,
        cliTokenId: ctx.tokenId,
        lineCount: dto.lines.length,
        metadata: {
          lines: redactedLines,
          ...(dto.client ? { client: dto.client } : {}),
        },
      },
    });

    let incidentsUpserted = 0;
    const taskKey = dto.taskId ?? 'global';

    for (const line of redactedLines) {
      if (incidentsUpserted >= MAX_SIGNAL_LINES_PER_BATCH) {
        break;
      }
      if (!isLikelySignalLine(line)) {
        continue;
      }
      const category = classifyTerminalLine(line);
      const normalized = normalizeForFingerprint(line);
      const fingerprint = this.fingerprintFor(category, normalized, taskKey);
      const excerpt = normalized.slice(0, 520);

      await this.prisma.terminalIncident.upsert({
        where: {
          projectId_fingerprint: {
            projectId: ctx.projectId,
            fingerprint,
          },
        },
        create: {
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          taskId: dto.taskId ?? null,
          fingerprint,
          category,
          excerpt,
          occurrenceCount: 1,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          batchId: batch.id,
        },
        update: {
          excerpt,
          ...(dto.taskId ? { taskId: dto.taskId } : {}),
          occurrenceCount: { increment: 1 },
          lastSeenAt: new Date(),
          batchId: batch.id,
        },
      });
      incidentsUpserted++;
    }

    await this.prisma.cliIngestToken.update({
      where: { id: ctx.tokenId },
      data: { lastUsedAt: new Date() },
    });

    this.projectSignals.scheduleRefreshSnapshot(ctx.projectId, ctx.organizationId);

    return {
      batchId: batch.id,
      linesStored: dto.lines.length,
      incidentsUpserted,
    };
  }
}
