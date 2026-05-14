import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import {
  compactProjectSignalEvidenceForAi,
  type ProjectSignalPayload,
} from '../projects/project-signals.service';
import { ProjectsService } from '../projects/projects.service';
import { ProjectSignalsService } from '../projects/project-signals.service';

export type ProjectImpactAnalyzeResult = {
  analysis: string;
  usedOpenAi: boolean;
  snapshotComputedAt: string;
};

function scheduleSummaryFromPayload(
  payload: ProjectSignalPayload,
): Record<string, number | null> {
  const t = payload.tasks;
  return {
    activeCount: t.activeCount,
    overdueCount: t.overdueCount,
    dueWithin7DaysCount: t.dueWithin7DaysCount,
    dueWithin3DaysCount: t.dueWithin3DaysCount ?? null,
    dueBetween4And7DaysCount: t.dueBetween4And7DaysCount ?? null,
    dueSoonLowProgressCount: t.dueSoonLowProgressCount ?? null,
  };
}

@Injectable()
export class ProjectImpactAnalyzerService {
  private readonly log = new Logger(ProjectImpactAnalyzerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly signals: ProjectSignalsService,
  ) {}

  async analyze(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectImpactAnalyzeResult> {
    await this.projects.getProjectInOrg(projectId, organizationId);

    const snapshot = await this.signals.refreshSnapshot(
      projectId,
      organizationId,
    );
    const payload = snapshot.payload as unknown as ProjectSignalPayload;
    const evidence = compactProjectSignalEvidenceForAi(payload);
    const scheduleSummary = scheduleSummaryFromPayload(payload);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { name: true },
    });
    const name = project?.name ?? 'Project';

    const risk = await this.prisma.projectRiskEvaluation.findUnique({
      where: { projectId },
      select: { level: true, score: true, reasons: true, evaluatedAt: true },
    });

    const tasks = await this.prisma.task.findMany({
      where: { projectId, status: { notIn: ['CANCELLED'] } },
      select: {
        title: true,
        status: true,
        progress: true,
        deadline: true,
        githubIssueNumber: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });

    const incidents = await this.prisma.terminalIncident.findMany({
      where: { projectId },
      select: {
        category: true,
        fingerprint: true,
        excerpt: true,
        lastSeenAt: true,
        occurrenceCount: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 14,
    });

    const taskPack = tasks.map((t) => ({
      title: t.title,
      status: t.status,
      progress: t.progress,
      deadline: t.deadline?.toISOString() ?? null,
      githubIssueNumber: t.githubIssueNumber,
    }));

    const incidentPack = incidents.map((i) => ({
      category: i.category,
      fingerprintShort: `${i.fingerprint.slice(0, 12)}…`,
      excerpt:
        i.excerpt.length > 360 ? `${i.excerpt.slice(0, 360)}…` : i.excerpt,
      lastSeenAt: i.lastSeenAt.toISOString(),
      occurrenceCount: i.occurrenceCount,
    }));

    const llm = await this.tryOpenAi({
      projectName: name,
      scheduleSummary,
      signalEvidence: evidence,
      latestRisk: risk
        ? {
            level: risk.level,
            score: risk.score,
            reasons: risk.reasons,
            evaluatedAt: risk.evaluatedAt.toISOString(),
          }
        : null,
      recentTasks: taskPack,
      recentTerminalIncidents: incidentPack,
    });
    if (llm) {
      return {
        analysis: llm,
        usedOpenAi: true,
        snapshotComputedAt: snapshot.computedAt.toISOString(),
      };
    }

    return {
      analysis: this.heuristic({
        projectName: name,
        scheduleSummary,
        signalEvidence: evidence,
        latestRisk: risk,
        taskPack,
        incidentPack,
      }),
      usedOpenAi: false,
      snapshotComputedAt: snapshot.computedAt.toISOString(),
    };
  }

  private heuristic(input: {
    projectName: string;
    scheduleSummary: Record<string, number | null>;
    signalEvidence: Record<string, unknown>;
    latestRisk: {
      level: string;
      score: number;
      reasons: unknown;
      evaluatedAt: Date;
    } | null;
    taskPack: Array<{
      title: string;
      status: string;
      progress: number;
      deadline: string | null;
      githubIssueNumber: number | null;
    }>;
    incidentPack: Array<{
      category: string;
      fingerprintShort: string;
      excerpt: string;
      lastSeenAt: string;
      occurrenceCount: number;
    }>;
  }): string {
    const s = input.scheduleSummary;
    const lines: string[] = [
      'TRACE ANALYST (heuristic)',
      '',
      `Project: ${input.projectName}`,
      `Signal window (hours): ${(input.signalEvidence.windowHours as number) ?? '—'}`,
      '',
      'Schedule rollup:',
      `• Active tasks: ${s.activeCount ?? 0}`,
      `• Overdue (active): ${s.overdueCount ?? 0}`,
      `• Due within 7 days: ${s.dueWithin7DaysCount ?? 0}`,
      `• Due within 3 days: ${s.dueWithin3DaysCount ?? 0}`,
      `• Due in 7d with progress <35%: ${s.dueSoonLowProgressCount ?? 0}`,
      '',
    ];

    if (input.latestRisk) {
      lines.push(
        `Latest saved risk evaluation: ${input.latestRisk.level} (score ${input.latestRisk.score}), from ${input.latestRisk.evaluatedAt.toISOString()}.`,
        '(Run “Evaluate” on the risk panel to refresh this before relying on it.)',
        '',
      );
    } else {
      lines.push(
        'No persisted risk row yet — interpret raw signals only, or run Evaluate on the risk panel.',
        '',
      );
    }

    const overdueTasks = input.taskPack.filter((t) => {
      if (!t.deadline || t.status === 'DONE') {
        return false;
      }
      return new Date(t.deadline).getTime() < Date.now();
    });
    if (overdueTasks.length > 0) {
      lines.push(
        'Tasks that look overdue vs “now” (title / status / progress):',
        ...overdueTasks.slice(0, 6).map(
          (t) =>
            `• ${t.title} — ${t.status} @ ${t.progress}%${t.githubIssueNumber != null ? ` (issue #${t.githubIssueNumber})` : ''}`,
        ),
        '',
      );
    }

    if (input.incidentPack.length > 0) {
      lines.push('Recent terminal incidents (redacted excerpts, newest first):');
      for (const i of input.incidentPack.slice(0, 5)) {
        lines.push(
          `• [${i.category}] ${i.fingerprintShort} (×${i.occurrenceCount}) @ ${i.lastSeenAt}`,
          `  ${i.excerpt.replace(/\s+/g, ' ').trim()}`,
        );
      }
      lines.push('');
    }

    const term = input.signalEvidence.terminal as
      | Record<string, unknown>
      | undefined;
    if (term && typeof term === 'object') {
      lines.push(
        'Terminal aggregates (window):',
        `• Incidents touched: ${term.incidentsTouchedInWindow ?? '—'}`,
        `• New fingerprints: ${term.newFingerprintsInWindow ?? '—'}`,
        `• Batches: ${term.batchesInWindow ?? '—'}`,
        '',
      );
    }

    lines.push(
      'Feasibility read:',
      (s.overdueCount ?? 0) > 0 || (s.dueSoonLowProgressCount ?? 0) > 0
        ? 'Delivery date pressure is material: overdue work and/or low progress on near-term deadlines will likely pull focus and can slip the overall plan unless scope or dates move.'
        : (s.dueWithin3DaysCount ?? 0) > 0
          ? 'Several deadlines land very soon — execution risk is elevated even if nothing is overdue yet.'
          : (s.dueWithin7DaysCount ?? 0) > 0
            ? 'There is upcoming deadline density — monitor burn-down and dependencies for the next week.'
            : 'No strong deadline-density signal from this rollup alone; still review GitHub + terminal noise below.',
      '',
      'Set OPENAI_API_KEY on the API for Trace Analyst to produce a fuller narrative (inference only; no training).',
    );

    return lines.join('\n').slice(0, 12_000);
  }

  private openAiKey(): string | null {
    const k =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ??
      process.env.OPENAI_API_KEY?.trim();
    return k && k.length > 0 ? k : null;
  }

  private openAiModel(): string {
    return (
      this.config.get<string>('OPENAI_IMPACT_MODEL')?.trim() ??
      process.env.OPENAI_IMPACT_MODEL?.trim() ??
      this.config.get<string>('OPENAI_RISK_MODEL')?.trim() ??
      process.env.OPENAI_RISK_MODEL?.trim() ??
      'gpt-4o-mini'
    );
  }

  private async tryOpenAi(input: {
    projectName: string;
    scheduleSummary: Record<string, number | null>;
    signalEvidence: Record<string, unknown>;
    latestRisk: {
      level: string;
      score: number;
      reasons: unknown;
      evaluatedAt: string;
    } | null;
    recentTasks: unknown[];
    recentTerminalIncidents: unknown[];
  }): Promise<string | null> {
    const key = this.openAiKey();
    if (!key) {
      return null;
    }
    const model = this.openAiModel();
    const system = [
      "You are Trace Analyst, Foretrace's delivery copilot.",
      'You receive JSON only: project name, scheduleSummary (deadline-focused counts), signalEvidence (aggregated GitHub/terminal/task rollup — no secrets), optional latest persisted risk row, recent task rows (titles, status, progress, deadlines, issue numbers), and recent terminal incident rows (already redacted excerpts).',
      'Synthesize how these signals together could affect hitting project goals and dates. Be explicit about schedule risk vs operational/GitHub noise.',
      'Do not invent repositories, people, or incidents not present in JSON. Do not mention API keys or tokens.',
      'Output plain text, no markdown headings. 5–10 short paragraphs or bullet blocks; stay under 2500 words.',
    ].join(' ');
    const user = JSON.stringify(input);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.25,
          max_tokens: 900,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.log.warn(`OpenAI project impact HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return null;
      }
      return text.slice(0, 12_000);
    } catch (e: unknown) {
      this.log.warn(
        `OpenAI project impact failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    } finally {
      clearTimeout(t);
    }
  }
}
