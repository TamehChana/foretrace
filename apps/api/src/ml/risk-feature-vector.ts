import type { ProjectSignalPayload } from '../projects/project-signals.service';

/** Normalized numeric inputs for logistic / softmax models (fixed length). */
export const RISK_ML_FEATURE_COUNT = 16;

export const RISK_ML_FEATURE_NAMES: readonly string[] = [
  'windowHoursNorm',
  'overdueShare',
  'dueWithin3DaysShare',
  'dueSoonLowProgressShare',
  'dueBetween4And7DaysShare',
  'dueWithin7DaysShare',
  'activeCountShare',
  'terminalIncidentsShare',
  'terminalNewFingerprintsShare',
  'terminalBatchesShare',
  'taskScopedIncidentTouchesShare',
  'mintedTokenBatchesShare',
  'githubWebhookEventsShare',
  'openPullRequestsShare',
  'openIssuesShare',
  'githubDefaultBranchStatusFailure',
] as const;

function capRatio(n: number, denom: number): number {
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  if (!Number.isFinite(denom) || denom <= 0) {
    return 0;
  }
  return Math.min(n / denom, 1);
}

/**
 * Maps a signal snapshot to a bounded feature vector (no PII).
 * Bias term is **not** included here — models prepend `1` internally.
 */
export function extractRiskMlFeatures(p: ProjectSignalPayload): number[] {
  const t = p.terminal;
  const task = p.tasks;
  const gh = p.github;
  const touchSum = (p.tasksWithTerminalFriction ?? []).reduce(
    (s, r) => s + r.incidentTouchesInWindow,
    0,
  );
  const mintSum = (p.terminalByMintedTokenUser ?? []).reduce(
    (s, r) => s + r.batchesInWindow,
    0,
  );
  const pr = gh.openPullRequests ?? 0;
  const iss = gh.openIssues ?? 0;
  const statusFail = gh.rest?.combinedStatus === 'failure' ? 1 : 0;

  return [
    capRatio(p.windowHours, 168),
    capRatio(task.overdueCount, 20),
    capRatio(task.dueWithin3DaysCount ?? 0, 20),
    capRatio(task.dueSoonLowProgressCount ?? 0, 15),
    capRatio(task.dueBetween4And7DaysCount ?? 0, 20),
    capRatio(task.dueWithin7DaysCount ?? 0, 40),
    capRatio(task.activeCount, 80),
    capRatio(t.incidentsTouchedInWindow, 15),
    capRatio(t.newFingerprintsInWindow, 15),
    capRatio(t.batchesInWindow, 100),
    capRatio(touchSum, 20),
    capRatio(mintSum, 40),
    capRatio(gh.webhookEventsInWindow, 120),
    capRatio(pr, 40),
    capRatio(iss, 40),
    statusFail,
  ];
}

/** Augment feature vector with bias `1` (length F+1). */
export function augmentWithBias(features: number[]): number[] {
  if (features.length !== RISK_ML_FEATURE_COUNT) {
    throw new Error(`Expected ${RISK_ML_FEATURE_COUNT} features`);
  }
  return [...features, 1];
}
