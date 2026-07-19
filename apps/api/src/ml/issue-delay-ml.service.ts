import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RiskLevel, TaskPriority, TaskStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { RiskMlPredictionJson } from './risk-ml.service';

type DelayWeightsFile = {
  modelVersion: string;
  source?: string;
  featureNames: string[];
  scalerMean: number[];
  scalerScale: number[];
  coef: number[];
  intercept: number;
};

const DAY_MS = 86_400_000;

function priorityOrd(p: TaskPriority): number {
  switch (p) {
    case TaskPriority.LOW:
      return 2;
    case TaskPriority.HIGH:
      return 4;
    case TaskPriority.MEDIUM:
    default:
      return 3;
  }
}

function levelFromDelayProb(p: number): RiskLevel {
  if (p >= 0.65) {
    return RiskLevel.CRITICAL;
  }
  if (p >= 0.45) {
    return RiskLevel.HIGH;
  }
  if (p >= 0.25) {
    return RiskLevel.MEDIUM;
  }
  return RiskLevel.LOW;
}

function sigmoid(z: number): number {
  if (z >= 30) {
    return 1;
  }
  if (z <= -30) {
    return 0;
  }
  return 1 / (1 + Math.exp(-z));
}

/**
 * Issue-level delay model trained on Choetkiertikul EMSE2017 (portable logistic export).
 * Aggregates open-task delay probabilities into a project second opinion.
 * Does not set the official rule-based risk score.
 */
@Injectable()
export class IssueDelayMlService {
  private readonly log = new Logger(IssueDelayMlService.name);
  private weights: DelayWeightsFile | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  enabled(): boolean {
    const raw =
      this.config.get<string>('FORETRACE_ML_RISK_ENABLED')?.trim() ??
      process.env.FORETRACE_ML_RISK_ENABLED?.trim();
    if (raw === '0' || raw === 'false' || raw === 'no') {
      return false;
    }
    if (raw === '1' || raw === 'true' || raw === 'yes') {
      return true;
    }
    return this.loadWeights() !== null;
  }

  async predictForProject(
    projectId: string,
    organizationId: string,
  ): Promise<RiskMlPredictionJson | null> {
    if (!this.enabled()) {
      return null;
    }
    const w = this.loadWeights();
    if (!w) {
      return null;
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        project: { organizationId },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        deadline: { not: null },
      },
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        progress: true,
        deadline: true,
        createdAt: true,
        assigneeId: true,
        githubIssueNumber: true,
      },
    });

    if (tasks.length === 0) {
      this.log.debug(
        `issue-delay: no open tasks with deadlines for project ${projectId}`,
      );
      return null;
    }

    const workloadByAssignee = new Map<string, number>();
    for (const t of tasks) {
      if (!t.assigneeId) {
        continue;
      }
      workloadByAssignee.set(
        t.assigneeId,
        (workloadByAssignee.get(t.assigneeId) ?? 0) + 1,
      );
    }

    const now = Date.now();
    const probs: number[] = [];
    for (const t of tasks) {
      const deadlineMs = t.deadline!.getTime();
      const remainingDay = Math.max(0, (deadlineMs - now) / DAY_MS);
      const progressTime = Math.max(0, (now - t.createdAt.getTime()) / DAY_MS);
      const linked = t.githubIssueNumber != null ? 1 : 0;
      const workload = t.assigneeId
        ? (workloadByAssignee.get(t.assigneeId) ?? 1)
        : 1;
      // Foretrace has no Jira changelog/comments — leave process counters at 0.
      const feat: Record<string, number> = {
        discussion: 0,
        repetition: 0,
        perofdelay: 0,
        workload,
        no_comment: 0,
        no_priority_change: 0,
        no_fixversion: linked,
        no_fixversion_change: 0,
        no_issuelink: linked,
        no_blocking: t.status === TaskStatus.BLOCKED ? 1 : 0,
        no_blockedby: 0,
        no_affectversion: 0,
        reporterrep: 0,
        no_des_change: 0,
        ProgressTime: progressTime,
        RemainingDay: remainingDay,
        priority_ord: priorityOrd(t.priority),
      };
      probs.push(this.score(w, feat));
    }

    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    const max = Math.max(...probs);
    const predictedLevel = levelFromDelayProb(mean);
    // Softmax-like display over risk bands from mean delay probability.
    const classProbabilities = this.bandProbabilities(mean);

    return {
      modelVersion: w.modelVersion,
      predictedLevel,
      classProbabilities,
      deadlinePressureIndex: Math.max(0, Math.min(1, mean)),
      meanDelayProbability: mean,
      maxDelayProbability: max,
      openTasksScored: tasks.length,
      source: w.source ?? 'EMSE2017',
    };
  }

  private bandProbabilities(meanDelay: number): Record<string, number> {
    const levels: RiskLevel[] = [
      RiskLevel.LOW,
      RiskLevel.MEDIUM,
      RiskLevel.HIGH,
      RiskLevel.CRITICAL,
    ];
    const centers = [0.12, 0.35, 0.55, 0.78];
    const raw = centers.map((c) => Math.exp(-((meanDelay - c) ** 2) / (2 * 0.08 ** 2)));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const out: Record<string, number> = {};
    for (let i = 0; i < levels.length; i++) {
      out[levels[i]] = raw[i] / sum;
    }
    return out;
  }

  private score(w: DelayWeightsFile, feat: Record<string, number>): number {
    let z = w.intercept;
    for (let i = 0; i < w.featureNames.length; i++) {
      const name = w.featureNames[i];
      const raw = feat[name] ?? 0;
      const scale = w.scalerScale[i] === 0 ? 1 : w.scalerScale[i];
      const x = (raw - w.scalerMean[i]) / scale;
      z += w.coef[i] * x;
    }
    return sigmoid(z);
  }

  private loadWeights(): DelayWeightsFile | null {
    if (this.weights) {
      return this.weights;
    }
    const configured =
      this.config.get<string>('FORETRACE_DELAY_ML_WEIGHTS_PATH')?.trim() ??
      process.env.FORETRACE_DELAY_ML_WEIGHTS_PATH?.trim();
    const candidates = [
      configured,
      join(__dirname, 'delay-ml-v1.weights.json'),
      join(process.cwd(), 'dist', 'ml', 'delay-ml-v1.weights.json'),
      join(process.cwd(), 'src', 'ml', 'delay-ml-v1.weights.json'),
      join(process.cwd(), 'apps', 'api', 'dist', 'ml', 'delay-ml-v1.weights.json'),
      join(process.cwd(), 'apps', 'api', 'src', 'ml', 'delay-ml-v1.weights.json'),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);

    for (const path of candidates) {
      try {
        const raw = readFileSync(path, 'utf8');
        const parsed = JSON.parse(raw) as DelayWeightsFile;
        if (
          !Array.isArray(parsed.featureNames) ||
          !Array.isArray(parsed.coef) ||
          parsed.featureNames.length !== parsed.coef.length
        ) {
          continue;
        }
        this.weights = parsed;
        this.log.log(`Issue-delay ML weights loaded from ${path}`);
        return this.weights;
      } catch {
        /* try next */
      }
    }
    this.log.warn('Issue-delay ML weights not found; delayPrediction disabled');
    this.weights = null;
    return null;
  }
}
