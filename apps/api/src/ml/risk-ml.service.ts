import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskLevel } from '@prisma/client';

import type { ProjectSignalPayload } from '../projects/project-signals.service';
import {
  augmentWithBias,
  extractRiskMlFeatures,
  RISK_ML_FEATURE_COUNT,
} from './risk-feature-vector';
import { predictBinaryProb, predictMultinomialProbs } from './risk-ml-logit';

export type RiskMlPredictionJson = {
  modelVersion: string;
  predictedLevel: RiskLevel;
  classProbabilities: Record<string, number>;
  /** 0–1: learned index aligned with acute deadline / slip pressure (see `docs/ML-RISK.md`). */
  deadlinePressureIndex: number;
};

type WeightsFile = {
  version: string;
  featureCount: number;
  classOrder: RiskLevel[];
  level: { W: number[][] };
  deadlinePressure: { w: number[] };
};

@Injectable()
export class RiskMlService {
  private readonly log = new Logger(RiskMlService.name);
  private weights: WeightsFile | null = null;

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    const raw =
      this.config.get<string>('FORETRACE_ML_RISK_ENABLED')?.trim() ??
      process.env.FORETRACE_ML_RISK_ENABLED?.trim();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  predict(payload: ProjectSignalPayload): RiskMlPredictionJson | null {
    if (!this.enabled()) {
      return null;
    }
    const w = this.loadWeights();
    if (!w) {
      return null;
    }
    const feats = extractRiskMlFeatures(payload);
    if (feats.length !== w.featureCount || w.featureCount !== RISK_ML_FEATURE_COUNT) {
      this.log.warn('Risk ML feature dimension mismatch; skipping prediction');
      return null;
    }
    const xAug = augmentWithBias(feats);
    const W = w.level.W;
    if (
      !Array.isArray(W) ||
      W.length !== w.classOrder.length ||
      !W[0] ||
      W[0].length !== xAug.length
    ) {
      this.log.warn('Risk ML weight matrix invalid; skipping prediction');
      return null;
    }
    const wDead = w.deadlinePressure?.w;
    if (!Array.isArray(wDead) || wDead.length !== xAug.length) {
      this.log.warn('Risk ML deadline weights invalid; skipping prediction');
      return null;
    }

    const probs = predictMultinomialProbs(W, xAug);
    let best = 0;
    for (let k = 1; k < probs.length; k++) {
      if (probs[k] > probs[best]) {
        best = k;
      }
    }
    const predictedLevel = w.classOrder[best] ?? RiskLevel.MEDIUM;
    const classProbabilities: Record<string, number> = {};
    for (let k = 0; k < w.classOrder.length; k++) {
      classProbabilities[w.classOrder[k]] = probs[k] ?? 0;
    }
    const deadlinePressureIndex = Math.max(
      0,
      Math.min(1, predictBinaryProb(wDead, xAug)),
    );

    return {
      modelVersion: `risk-ml-v${w.version}`,
      predictedLevel,
      classProbabilities,
      deadlinePressureIndex,
    };
  }

  private loadWeights(): WeightsFile | null {
    if (this.weights) {
      return this.weights;
    }
    const path =
      this.config.get<string>('FORETRACE_ML_RISK_WEIGHTS_PATH')?.trim() ??
      process.env.FORETRACE_ML_RISK_WEIGHTS_PATH?.trim() ??
      join(__dirname, 'risk-ml-v1.weights.json');
    try {
      const raw = readFileSync(path, 'utf8');
      this.weights = JSON.parse(raw) as WeightsFile;
      return this.weights;
    } catch (e: unknown) {
      this.log.warn(
        `Risk ML weights not loaded from ${path}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      this.weights = null;
      return null;
    }
  }
}
