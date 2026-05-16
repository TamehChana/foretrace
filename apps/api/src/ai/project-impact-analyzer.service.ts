import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsightFeedbackKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  compactProjectSignalEvidenceForAi,
  type ProjectSignalPayload,
} from '../projects/project-signals.service';
import { isDeadlineOverdueUtc } from '../projects/task-deadline.util';
import { ProjectsService } from '../projects/projects.service';
import { ProjectSignalsService } from '../projects/project-signals.service';
import { TraceAnalystContextService } from './trace-analyst-context.service';

export type ProjectImpactAnalyzeResult = {
  analysis: string;
  usedOpenAi: boolean;
  snapshotComputedAt: string;
  persistedRunId: string;
};

export type ProjectImpactHistoryRow = {
  id: string;
  analysis: string;
  usedOpenAi: boolean;
  snapshotComputedAt: string;
  createdAt: string;
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
    private readonly traceAnalyst: TraceAnalystContextService,
  ) {}

  async listHistory(
    projectId: string,
    organizationId: string,
    limit = 10,
  ): Promise<ProjectImpactHistoryRow[]> {
    await this.projects.getProjectInOrg(projectId, organizationId);
    const take = Math.min(Math.max(limit, 1), 30);
    const rows = await this.prisma.projectImpactAnalysisRun.findMany({
      where: { projectId, organizationId },
      select: {
        id: true,
        analysis: true,
        usedOpenAi: true,
        snapshotComputedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      analysis: r.analysis,
      usedOpenAi: r.usedOpenAi,
      snapshotComputedAt: r.snapshotComputedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

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
        taskId: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    });

    const githubActivities = await this.prisma.taskGitHubActivity.findMany({
      where: { task: { projectId } },
      select: {
        occurredAt: true,
        eventType: true,
        action: true,
        summary: true,
        actorLogin: true,
        task: { select: { title: true, githubIssueNumber: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 18,
    });

    const promptFeedbackHints = await this.traceAnalyst.promptFeedbackHints(
      projectId,
      InsightFeedbackKind.PROJECT_IMPACT_ANALYSIS,
    );

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
      taskId: i.taskId,
    }));

    const githubActivityPack = githubActivities.map((a) => ({
      at: a.occurredAt.toISOString(),
      eventType: a.eventType,
      action: a.action,
      actorLogin: a.actorLogin,
      summary: a.summary,
      taskTitle: a.task.title,
      githubIssueNumber: a.task.githubIssueNumber,
    }));

    const llmInput = {
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
      recentGithubActivity: githubActivityPack,
      promptFeedbackHints,
    };

    const llm = await this.tryOpenAi(llmInput);
    const analysis =
      llm ??
      this.heuristic({
        projectName: name,
        scheduleSummary,
        signalEvidence: evidence,
        latestRisk: risk,
        taskPack,
        incidentPack,
        githubActivityPack,
      });

    const usedOpenAi = Boolean(llm);
    const snapshotComputedAt = snapshot.computedAt;

    const persisted = await this.prisma.projectImpactAnalysisRun.create({
      data: {
        organizationId,
        projectId,
        analysis,
        usedOpenAi,
        snapshotComputedAt,
      },
      select: { id: true },
    });

    return {
      analysis,
      usedOpenAi,
      snapshotComputedAt: snapshotComputedAt.toISOString(),
      persistedRunId: persisted.id,
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
    githubActivityPack: Array<{
      at: string;
      eventType: string;
      action: string | null;
      actorLogin: string | null;
      summary: string;
      taskTitle: string;
      githubIssueNumber: number | null;
    }>;
  }): string {
    const s = input.scheduleSummary;
    const lines: string[] = [
      'TRACE ANALYST (heuristic)',
      '',
      'EXECUTIVE READ',
      `Project “${input.projectName}” — synthesized from the latest signal snapshot, persisted risk row (if any), recent tasks, and terminal incident excerpts.`,
      '',
      'SCHEDULE ROLLUP',
      `• Active tasks: ${s.activeCount ?? 0}`,
      `• Overdue (active): ${s.overdueCount ?? 0}`,
      `• Due within 7 days: ${s.dueWithin7DaysCount ?? 0}`,
      `• Due within 3 days: ${s.dueWithin3DaysCount ?? 0}`,
      `• Due in 7d with progress <35%: ${s.dueSoonLowProgressCount ?? 0}`,
      '',
    ];

    if (input.latestRisk) {
      lines.push(
        'LATEST SAVED RISK',
        `${input.latestRisk.level} (score ${input.latestRisk.score}), from ${input.latestRisk.evaluatedAt.toISOString()}.`,
        '(Run “Evaluate” on the risk panel to refresh before relying on it.)',
        '',
      );
    } else {
      lines.push(
        'LATEST SAVED RISK',
        'None yet — interpret raw signals only, or run Evaluate on the risk panel.',
        '',
      );
    }

    const overdueTasks = input.taskPack.filter((t) => {
      if (!t.deadline || t.status === 'DONE' || t.status === 'CANCELLED') {
        return false;
      }
      return isDeadlineOverdueUtc(new Date(t.deadline));
    });
    if (overdueTasks.length > 0) {
      lines.push(
        'TASKS (overdue vs now)',
        ...overdueTasks.slice(0, 6).map(
          (t) =>
            `• ${t.title} — ${t.status} @ ${t.progress}%${t.githubIssueNumber != null ? ` (issue #${t.githubIssueNumber})` : ''}`,
        ),
        '',
      );
    }

    if (input.incidentPack.length > 0) {
      lines.push('TERMINAL INCIDENTS (redacted excerpts, newest first)');
      for (const i of input.incidentPack.slice(0, 6)) {
        lines.push(
          `• [${i.category}] ${i.fingerprintShort} (×${i.occurrenceCount}) @ ${i.lastSeenAt}`,
          `  ${i.excerpt.replace(/\s+/g, ' ').trim()}`,
        );
      }
      lines.push('');
    }

    if (input.githubActivityPack.length > 0) {
      lines.push('GITHUB ACTIVITY (task-linked, newest first)');
      for (const a of input.githubActivityPack.slice(0, 6)) {
        lines.push(
          `• ${a.at} — ${a.taskTitle}${a.githubIssueNumber != null ? ` (#${a.githubIssueNumber})` : ''}: ${a.summary}`,
        );
      }
      lines.push('');
    }

    const term = input.signalEvidence.terminal as
      | Record<string, unknown>
      | undefined;
    if (term && typeof term === 'object') {
      lines.push(
        'SIGNAL WINDOW',
        `Hours: ${(input.signalEvidence.windowHours as number) ?? '—'}`,
        '',
        'TERMINAL AGGREGATES (window)',
        `• Incidents touched: ${term.incidentsTouchedInWindow ?? '—'}`,
        `• New fingerprints: ${term.newFingerprintsInWindow ?? '—'}`,
        `• Batches: ${term.batchesInWindow ?? '—'}`,
        '',
      );
    } else if (
      typeof input.signalEvidence.windowHours === 'number' &&
      Number.isFinite(input.signalEvidence.windowHours)
    ) {
      lines.push(
        'SIGNAL WINDOW',
        `Hours: ${input.signalEvidence.windowHours}`,
        '',
      );
    }

    lines.push(
      'FEASIBILITY READ',
      (s.overdueCount ?? 0) > 0 || (s.dueSoonLowProgressCount ?? 0) > 0
        ? 'Delivery date pressure is material: overdue work and/or low progress on near-term deadlines will likely pull focus and can slip the overall plan unless scope or dates move.'
        : (s.dueWithin3DaysCount ?? 0) > 0
          ? 'Several deadlines land very soon — execution risk is elevated even if nothing is overdue yet.'
          : (s.dueWithin7DaysCount ?? 0) > 0
            ? 'There is upcoming deadline density — monitor burn-down and dependencies for the next week.'
            : 'No strong deadline-density signal from this rollup alone; still review GitHub + terminal noise above.',
      '',
      'NEXT ACTIONS',
      '1. Confirm owners on overdue and ≤3d tasks.',
      '2. Pair terminal fingerprints with tasks (CLI task id) where possible.',
      '3. If GitHub is linked, sanity-check open PR/issue counts vs team capacity.',
      '',
      'CONFIDENCE: HIGH (deterministic template from the same JSON the LLM receives).',
      '',
      'Set OPENAI_API_KEY on the API for Trace Analyst to produce a fuller narrative (inference only; no training).',
    );

    return lines.join('\n').slice(0, 12_000);
  }

  private async tryOpenAi(input: Record<string, unknown>): Promise<string | null> {
    if (!this.traceAnalyst.openAiConfigured()) {
      return null;
    }
    const key =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ??
      process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      return null;
    }
    const model = this.traceAnalyst.openAiImpactModel();
    const system = [
      "You are Trace Analyst, Foretrace's delivery copilot.",
      'You receive JSON only: project name, scheduleSummary (deadline-focused counts), signalEvidence (aggregated GitHub/terminal/task rollup — no secrets), optional latest persisted risk row, recent task rows, recent terminal incident rows (redacted), recentGithubActivity (task-linked webhook summaries), and promptFeedbackHints (PM tuning — do not invent facts).',
      'When promptFeedbackHints is non-empty, adjust emphasis per PM feedback.',
      'Synthesize how these signals together could affect hitting project goals and dates. Be explicit about schedule risk vs operational/GitHub noise.',
      'Do not invent repositories, people, or incidents not present in JSON. Do not mention API keys or tokens.',
      'Output plain text only (no markdown # headings). Use these section titles on their own lines, in order:',
      'EXECUTIVE READ — 2–3 sentences.',
      'SCHEDULE AND DEADLINES — paragraph using scheduleSummary and overdue-looking tasks.',
      'COLLABORATION AND GITHUB — paragraph from signalEvidence.github and task issue numbers where relevant.',
      'TERMINAL AND ENGINEERING FRICTION — paragraph from incidents and terminal aggregates.',
      'RISK CROSS-CHECK — compare narrative to latestRisk (if present); say if persisted risk aligns or diverges.',
      'NEXT ACTIONS — numbered 1.–4. PM moves grounded in the JSON.',
      'CONFIDENCE — one line: CONFIDENCE: HIGH | CONFIDENCE: MEDIUM | CONFIDENCE: LOW (use LOW if incidents or tasks lists are empty and signalEvidence is sparse).',
      'Stay under 2500 words total.',
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
          max_tokens: 1100,
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
