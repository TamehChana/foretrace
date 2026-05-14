/**
 * Offline trainer: fits multinomial logistic (risk level) + binary logistic (deadline pressure)
 * on synthetic snapshots labeled by the production rule engine (`computeRiskFromPayload`).
 *
 * Run from repo: `npm run ml:train -w @foretrace/api`
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { RiskLevel } from '@prisma/client';

import { computeRiskFromPayload } from '../../projects/risk-score.engine';
import type { ProjectSignalPayload } from '../../projects/project-signals.service';
import {
  augmentWithBias,
  extractRiskMlFeatures,
  RISK_ML_FEATURE_COUNT,
} from '../risk-feature-vector';
import {
  predictBinaryProb,
  predictMultinomialProbs,
  trainBinaryOneStep,
  trainMultinomialOneStep,
} from '../risk-ml-logit';

const LEVEL_ORDER: RiskLevel[] = [
  RiskLevel.LOW,
  RiskLevel.MEDIUM,
  RiskLevel.HIGH,
  RiskLevel.CRITICAL,
];

function levelIndex(l: RiskLevel): number {
  return LEVEL_ORDER.indexOf(l);
}

function randInt(max: number): number {
  return Math.floor(Math.random() * (max + 1));
}

function randBool(p: number): boolean {
  return Math.random() < p;
}

/** Synthetic snapshot with plausible ranges (no PII). */
function randomPayload(): ProjectSignalPayload {
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

function deadlinePressureLabel(p: ProjectSignalPayload): 0 | 1 {
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

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function main(): void {
  const numSamples = 5000;
  const samples: { xAug: number[]; level: number; deadline: 0 | 1 }[] = [];
  for (let i = 0; i < numSamples; i++) {
    const p = randomPayload();
    const { level } = computeRiskFromPayload(p);
    const f = extractRiskMlFeatures(p);
    if (f.length !== RISK_ML_FEATURE_COUNT) {
      throw new Error('Feature length mismatch');
    }
    samples.push({
      xAug: augmentWithBias(f),
      level: levelIndex(level),
      deadline: deadlinePressureLabel(p),
    });
  }

  const numClasses = 4;
  const dim = RISK_ML_FEATURE_COUNT + 1;
  const W: number[][] = Array.from({ length: numClasses }, () =>
    Array.from({ length: dim }, () => (Math.random() - 0.5) * 0.02),
  );
  const wDeadline: number[] = Array.from({ length: dim }, () => (Math.random() - 0.5) * 0.02);

  const lr = 0.08;
  const epochs = 5;
  for (let e = 0; e < epochs; e++) {
    shuffleInPlace(samples);
    for (const s of samples) {
      trainMultinomialOneStep(W, s.xAug, s.level, lr);
      trainBinaryOneStep(wDeadline, s.xAug, s.deadline, lr * 0.5);
    }
  }

  let correct = 0;
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const s of samples.slice(0, 2000)) {
    const probs = predictMultinomialProbs(W, s.xAug);
    let best = 0;
    for (let k = 1; k < probs.length; k++) {
      if (probs[k] > probs[best]) {
        best = k;
      }
    }
    if (best === s.level) {
      correct++;
    }
    const pDead = predictBinaryProb(wDeadline, s.xAug);
    const pred = pDead >= 0.5 ? 1 : 0;
    if (pred === 1 && s.deadline === 1) {
      tp++;
    }
    if (pred === 1 && s.deadline === 0) {
      fp++;
    }
    if (pred === 0 && s.deadline === 0) {
      tn++;
    }
    if (pred === 0 && s.deadline === 1) {
      fn++;
    }
  }

  const outPath = join(process.cwd(), 'src/ml/risk-ml-v1.weights.json');
  mkdirSync(dirname(outPath), { recursive: true });
  const payload = {
    version: '1',
    featureCount: RISK_ML_FEATURE_COUNT,
    classOrder: LEVEL_ORDER,
    level: { W },
    deadlinePressure: { w: wDeadline },
    metrics: {
      levelAccuracyHoldoutSlice: correct / 2000,
      deadlineConfusionApprox: { tp, fp, tn, fn },
    },
    trainingNotes:
      'Synthetic labels from computeRiskFromPayload + heuristic deadline-pressure oracle; re-run after changing the rule engine.',
  };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath}`);
}

main();
