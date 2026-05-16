/**
 * Fits risk-ml weights from persisted evaluation runs (signalPayload) plus synthetic fill.
 * Requires DATABASE_URL and migration with RiskEvaluationRun.signalPayload.
 *
 * Run: `npm run ml:train:history -w @foretrace/api`
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { PrismaClient, RiskLevel } from '@prisma/client';

import { computeRiskFromPayload } from '../../projects/risk-score.engine';
import type { ProjectSignalPayload } from '../../projects/project-signals.service';
import {
  augmentWithBias,
  extractRiskMlFeatures,
  RISK_ML_FEATURE_COUNT,
} from '../risk-feature-vector';
import {
  trainBinaryOneStep,
  trainMultinomialOneStep,
} from '../risk-ml-logit';
import {
  deadlinePressureLabel,
  randomRiskMlPayload,
} from './risk-ml-synthetic';

const LEVEL_ORDER: RiskLevel[] = [
  RiskLevel.LOW,
  RiskLevel.MEDIUM,
  RiskLevel.HIGH,
  RiskLevel.CRITICAL,
];

function levelIndex(l: RiskLevel): number {
  return LEVEL_ORDER.indexOf(l);
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isPayload(v: unknown): v is ProjectSignalPayload {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    typeof o.windowHours === 'number' &&
    o.tasks !== null &&
    typeof o.tasks === 'object' &&
    o.github !== null &&
    typeof o.github === 'object' &&
    o.terminal !== null &&
    typeof o.terminal === 'object'
  );
}

function pushSample(
  samples: { xAug: number[]; level: number; deadline: 0 | 1 }[],
  p: ProjectSignalPayload,
  level: RiskLevel,
): void {
  const f = extractRiskMlFeatures(p);
  if (f.length !== RISK_ML_FEATURE_COUNT) {
    return;
  }
  samples.push({
    xAug: augmentWithBias(f),
    level: levelIndex(level),
    deadline: deadlinePressureLabel(p),
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.riskEvaluationRun.findMany({
      where: { signalPayload: { not: null } },
      select: { level: true, signalPayload: true },
      orderBy: { evaluatedAt: 'desc' },
      take: 5000,
    });

    const samples: { xAug: number[]; level: number; deadline: 0 | 1 }[] = [];
    let fromHistory = 0;

    for (const run of runs) {
      if (!isPayload(run.signalPayload)) {
        continue;
      }
      pushSample(samples, run.signalPayload, run.level);
      fromHistory += 1;
    }

    const targetTotal = 5000;
    while (samples.length < targetTotal) {
      const p = randomRiskMlPayload();
      const { level } = computeRiskFromPayload(p);
      pushSample(samples, p, level);
    }

    const numClasses = 4;
    const dim = RISK_ML_FEATURE_COUNT + 1;
    const W: number[][] = Array.from({ length: numClasses }, () =>
      Array.from({ length: dim }, () => (Math.random() - 0.5) * 0.02),
    );
    const wDeadline: number[] = Array.from({ length: dim }, () => (Math.random() - 0.5) * 0.02);

    const lr = fromHistory >= 200 ? 0.06 : 0.08;
    const epochs = fromHistory >= 200 ? 10 : 5;
    for (let e = 0; e < epochs; e++) {
      shuffleInPlace(samples);
      for (const s of samples) {
        trainMultinomialOneStep(W, s.xAug, s.level, lr);
        trainBinaryOneStep(wDeadline, s.xAug, s.deadline, lr * 0.5);
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
        trainingSamples: samples.length,
        fromHistoryRows: fromHistory,
        syntheticFillRows: samples.length - fromHistory,
      },
      trainingNotes:
        'Mixed RiskEvaluationRun.signalPayload history + synthetic fill; re-run after more Evaluate runs.',
    };
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(
      `Wrote ${outPath} (${fromHistory} history + ${samples.length - fromHistory} synthetic = ${samples.length} samples)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
