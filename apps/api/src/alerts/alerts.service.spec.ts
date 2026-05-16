import { RiskLevel } from '@prisma/client';

import { shouldEmitRiskEvaluationAlert } from './alerts.service';

describe('shouldEmitRiskEvaluationAlert', () => {
  const base = {
    previousLevel: RiskLevel.LOW,
    previousScore: 6,
    previousReasonCodes: ['GITHUB_HIGH_CHURN'],
    nextLevel: RiskLevel.MEDIUM,
    score: 34,
    reasonCodes: ['TASKS_OVERDUE', 'GITHUB_HIGH_CHURN'],
    reasons: [
      {
        code: 'TASKS_OVERDUE',
        detail: '2 active task(s) are past their deadline.',
      },
    ],
    schedule: { overdueCount: 2, dueWithin3DaysCount: 0, dueSoonLowProgressCount: 0 },
  };

  it('emits when level increases to at least MEDIUM', () => {
    expect(shouldEmitRiskEvaluationAlert(base)).toBe(true);
  });

  it('emits when overdue appears without level change', () => {
    expect(
      shouldEmitRiskEvaluationAlert({
        ...base,
        previousLevel: RiskLevel.MEDIUM,
        previousScore: 30,
        previousReasonCodes: ['GITHUB_HIGH_CHURN'],
        nextLevel: RiskLevel.MEDIUM,
        score: 32,
      }),
    ).toBe(true);
  });

  it('emits on large score jump at same level', () => {
    expect(
      shouldEmitRiskEvaluationAlert({
        ...base,
        previousLevel: RiskLevel.MEDIUM,
        previousScore: 18,
        previousReasonCodes: ['TASKS_OVERDUE'],
        nextLevel: RiskLevel.MEDIUM,
        score: 34,
      }),
    ).toBe(true);
  });

  it('skips LOW risk', () => {
    expect(
      shouldEmitRiskEvaluationAlert({
        ...base,
        nextLevel: RiskLevel.LOW,
        score: 10,
        reasonCodes: [],
      }),
    ).toBe(false);
  });

  it('skips when MEDIUM unchanged with small score delta and same reasons', () => {
    expect(
      shouldEmitRiskEvaluationAlert({
        ...base,
        previousLevel: RiskLevel.MEDIUM,
        previousScore: 32,
        previousReasonCodes: ['TASKS_OVERDUE', 'GITHUB_HIGH_CHURN'],
        nextLevel: RiskLevel.MEDIUM,
        score: 34,
      }),
    ).toBe(false);
  });
});
