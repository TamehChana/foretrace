/**
 * Prints holdout-style metrics for the shipped risk-ml weights (thesis tables).
 * Run: `npm run ml:metrics -w @foretrace/api`
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { RiskLevel } from '@prisma/client';

import { computeRiskFromPayload } from '../../projects/risk-score.engine';
import {
  augmentWithBias,
  extractRiskMlFeatures,
  RISK_ML_FEATURE_COUNT,
} from '../risk-feature-vector';
import { predictBinaryProb, predictMultinomialProbs } from '../risk-ml-logit';
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

type WeightsFile = {
  version: string;
  featureCount: number;
  classOrder: RiskLevel[];
  level: { W: number[][] };
  deadlinePressure: { w: number[] };
  metrics?: unknown;
  trainingNotes?: string;
};

function levelIndex(l: RiskLevel): number {
  return LEVEL_ORDER.indexOf(l);
}

function main(): void {
  const path = join(process.cwd(), 'src/ml/risk-ml-v1.weights.json');
  const w = JSON.parse(readFileSync(path, 'utf8')) as WeightsFile;
  if (w.featureCount !== RISK_ML_FEATURE_COUNT) {
    throw new Error('featureCount mismatch');
  }

  const n = 2000;
  let correct = 0;
  const confusion: number[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => 0),
  );
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  let agreeRules = 0;

  for (let i = 0; i < n; i++) {
    const p = randomRiskMlPayload();
    const { level: ruleLevel } = computeRiskFromPayload(p);
    const feats = extractRiskMlFeatures(p);
    const xAug = augmentWithBias(feats);
    const probs = predictMultinomialProbs(w.level.W, xAug);
    let best = 0;
    for (let k = 1; k < probs.length; k++) {
      if (probs[k] > probs[best]) {
        best = k;
      }
    }
    const truth = levelIndex(ruleLevel);
    confusion[truth][best] += 1;
    if (best === truth) {
      correct += 1;
    }
    if (w.classOrder[best] === ruleLevel) {
      agreeRules += 1;
    }
    const deadTruth = deadlinePressureLabel(p);
    const deadPred = predictBinaryProb(w.deadlinePressure.w, xAug) >= 0.5 ? 1 : 0;
    if (deadPred === 1 && deadTruth === 1) {
      tp++;
    }
    if (deadPred === 1 && deadTruth === 0) {
      fp++;
    }
    if (deadPred === 0 && deadTruth === 0) {
      tn++;
    }
    if (deadPred === 0 && deadTruth === 1) {
      fn++;
    }
  }

  const report = {
    modelVersion: `risk-ml-v${w.version}`,
    holdoutSyntheticN: n,
    levelAccuracy: correct / n,
    agreementWithRules: agreeRules / n,
    levelConfusionRowsTruthColsPred: {
      order: LEVEL_ORDER,
      matrix: confusion,
    },
    deadlinePressure: {
      tp,
      fp,
      tn,
      fn,
      precision: tp + fp === 0 ? 0 : tp / (tp + fp),
      recall: tp + fn === 0 ? 0 : tp / (tp + fn),
    },
    embeddedTrainingMetrics: w.metrics ?? null,
    trainingNotes: w.trainingNotes ?? null,
    note: 'Holdout labels currently follow the rule engine (bootstrap). Thesis ablation: compare rules score vs mlPrediction on real Evaluate runs.',
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main();
