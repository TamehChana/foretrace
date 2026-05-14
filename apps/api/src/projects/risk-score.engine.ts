import { RiskLevel } from '@prisma/client';

import type { GithubRestEnrichment } from './github-signal-rest-enricher';
import type { ProjectSignalPayload } from './project-signals.service';
import type { RiskReasonRow } from './risk-reason.types';

/**
 * Pure rule-based v0 risk engine (same logic as production `ProjectRiskService`).
 * Extracted so ML training scripts and tests can reuse labels without Nest DI.
 */
export function computeRiskFromPayload(payload: ProjectSignalPayload): {
  level: RiskLevel;
  score: number;
  reasons: RiskReasonRow[];
} {
  const reasons: RiskReasonRow[] = [];
  let score = 0;
  const hours = payload.windowHours;

  const overdue = payload.tasks.overdueCount;
  if (overdue > 0) {
    score += Math.min(overdue * 14, 42);
    reasons.push({
      code: 'TASKS_OVERDUE',
      detail: `${overdue} active task(s) are past their deadline.`,
    });
  }

  const imminent = payload.tasks.dueWithin3DaysCount ?? 0;
  if (imminent > 0) {
    score += Math.min(imminent * 5, 15);
    reasons.push({
      code: 'TASKS_DUE_IMMINENT',
      detail: `${imminent} active task(s) have a deadline within the next 3 days.`,
    });
  }

  const progressGap = payload.tasks.dueSoonLowProgressCount ?? 0;
  if (progressGap > 0) {
    score += Math.min(progressGap * 4, 16);
    reasons.push({
      code: 'TASK_DEADLINE_PROGRESS_GAP',
      detail: `${progressGap} active task(s) are due within 7 days and still below 35% progress.`,
    });
  }

  const dueSoon4to7 = payload.tasks.dueBetween4And7DaysCount ?? 0;
  if (dueSoon4to7 > 0) {
    score += Math.min(dueSoon4to7 * 4, 20);
    reasons.push({
      code: 'TASKS_DUE_SOON',
      detail: `${dueSoon4to7} active task(s) have a deadline between 4 and 7 days from now.`,
    });
  }

  const t = payload.terminal;
  if (
    t.incidentsTouchedInWindow > 0 ||
    t.newFingerprintsInWindow > 0 ||
    t.batchesInWindow > 25
  ) {
    const pts =
      Math.min(t.incidentsTouchedInWindow * 3, 12) +
      Math.min(t.newFingerprintsInWindow * 5, 20) +
      (t.batchesInWindow > 25 ? 10 : 0);
    score += Math.min(pts, 36);
    reasons.push({
      code: 'TERMINAL_FRICTION',
      detail: `Terminal ingest in the last ${hours}h: ${t.incidentsTouchedInWindow} incident(s) touched, ${t.newFingerprintsInWindow} new fingerprint(s), ${t.batchesInWindow} batch(es).`,
    });
  }

  const taskTerminal = payload.tasksWithTerminalFriction ?? [];
  const taskTouchSum = taskTerminal.reduce(
    (s, r) => s + r.incidentTouchesInWindow,
    0,
  );
  if (taskTouchSum > 0) {
    score += Math.min(taskTouchSum * 2, 12);
    const lines = taskTerminal
      .filter((r) => r.incidentTouchesInWindow > 0)
      .slice(0, 4)
      .map((r) => {
        const who =
          r.assigneeDisplayName?.trim() ||
          r.assigneeEmail ||
          (r.assigneeId ? `user ${r.assigneeId.slice(0, 8)}…` : 'unassigned');
        return `"${r.title}" (${who}): ${r.incidentTouchesInWindow} incident touch(es)`;
      });
    const more =
      taskTerminal.filter((r) => r.incidentTouchesInWindow > 0).length > 4
        ? ` (+${
            taskTerminal.filter((r) => r.incidentTouchesInWindow > 0).length -
            4
          } more)`
        : '';
    reasons.push({
      code: 'TASK_SCOPED_TERMINAL',
      detail: `Terminal friction tied to tasks (CLI used task id) in the last ${hours}h: ${lines.join('; ')}${more}.`,
    });
  }

  const gh = payload.github.webhookEventsInWindow;
  if (gh > 40) {
    score += 6;
    reasons.push({
      code: 'GITHUB_HIGH_CHURN',
      detail: `${gh} GitHub webhook events in the last ${hours}h.`,
    });
  }

  const rest = payload.github.rest as GithubRestEnrichment | null | undefined;
  if (rest?.combinedStatus === 'failure') {
    score += 12;
    reasons.push({
      code: 'GITHUB_COMMIT_STATUS_FAILURE',
      detail:
        'GitHub combined status for the default branch is failure (from REST API).',
    });
  }

  score = Math.min(100, Math.round(score));

  if (reasons.length === 0) {
    reasons.push({
      code: 'BASELINE',
      detail: `No elevated delivery-risk signals in the ${hours}h rollup.`,
    });
  }

  let level: RiskLevel;
  if (score <= 14) {
    level = RiskLevel.LOW;
  } else if (score <= 36) {
    level = RiskLevel.MEDIUM;
  } else if (score <= 58) {
    level = RiskLevel.HIGH;
  } else {
    level = RiskLevel.CRITICAL;
  }

  if (overdue >= 6) {
    level = RiskLevel.CRITICAL;
  } else if (overdue >= 3) {
    if (level === RiskLevel.LOW) {
      level = RiskLevel.MEDIUM;
    } else if (level === RiskLevel.MEDIUM) {
      level = RiskLevel.HIGH;
    }
  }

  return { level, score, reasons };
}
