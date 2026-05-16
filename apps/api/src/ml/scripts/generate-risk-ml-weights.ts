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

function main(): void {
  const numSamples = 5000;
  const samples: { xAug: number[]; level: number; deadline: 0 | 1 }[] = [];
  for (let i = 0; i < numSamples; i++) {
    const p = randomRiskMlPayload();
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
