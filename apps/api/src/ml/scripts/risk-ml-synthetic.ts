import type { ProjectSignalPayload } from '../../projects/project-signals.service';

function randInt(max: number): number {
  return Math.floor(Math.random() * (max + 1));
}

function randBool(p: number): boolean {
  return Math.random() < p;
}

/** Synthetic snapshot with plausible ranges (no PII). */
export function randomRiskMlPayload(): ProjectSignalPayload {
  const windowHours = [24, 48, 72][randInt(2)];
  const overdue = randInt(8);
  const due3 = randInt(12);
  const lowProg = randInt(6);
  const d47 = randInt(10);
  const d7 = Math.max(due3, d47, randInt(15));
  const active = Math.max(d7, overdue, randInt(25));
  const incidents = randInt(8);
  const fps = randInt(6);
  const batches = randInt(90);
  const webhook = randInt(100);
  const nFriction = randInt(3);
  const friction =
    nFriction === 0
      ? []
      : Array.from({ length: nFriction }, (_, i) => ({
          taskId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          title: `Task ${i}`,
          assigneeId: null,
          assigneeEmail: 'dev@example.com',
          assigneeDisplayName: null,
          incidentTouchesInWindow: randInt(4),
          batchesPostedInWindow: randInt(3),
          lastIncidentAt: new Date().toISOString(),
          lastBatchAt: new Date().toISOString(),
        }));
  const minted =
    randBool(0.3) && friction.length > 0
      ? [
          {
            userId: '00000000-0000-4000-8000-000000000001',
            email: 'cli@example.com',
            displayName: null,
            batchesInWindow: randInt(20),
            linesInWindow: randInt(500),
            incidentRowsLinkedToMintedBatchesInWindow: randInt(5),
          },
        ]
      : [];

  const rest =
    randBool(0.15) && randBool(0.5)
      ? { combinedStatus: 'failure' as const }
      : randBool(0.4)
        ? { combinedStatus: 'success' as const }
        : null;

  return {
    windowHours,
    github: {
      webhookEventsInWindow: webhook,
      openPullRequests: randBool(0.7) ? randInt(25) : null,
      openIssues: randBool(0.7) ? randInt(30) : null,
      lastEventAt: new Date().toISOString(),
      rest,
    },
    terminal: {
      incidentsTouchedInWindow: incidents,
      newFingerprintsInWindow: fps,
      batchesInWindow: batches,
    },
    tasks: {
      activeCount: active,
      overdueCount: overdue,
      dueWithin7DaysCount: d7,
      dueWithin3DaysCount: due3,
      dueBetween4And7DaysCount: d47,
      dueSoonLowProgressCount: lowProg,
    },
    tasksWithTerminalFriction: friction,
    terminalByMintedTokenUser: minted,
  };
}

export function deadlinePressureLabel(p: ProjectSignalPayload): 0 | 1 {
  if (p.tasks.overdueCount > 0) {
    return 1;
  }
  if ((p.tasks.dueSoonLowProgressCount ?? 0) > 0) {
    return 1;
  }
  if ((p.tasks.dueWithin3DaysCount ?? 0) >= 3) {
    return 1;
  }
  return 0;
}
