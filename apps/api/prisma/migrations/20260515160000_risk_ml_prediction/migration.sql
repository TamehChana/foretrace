-- Risk ML: persisted multinomial + deadline-pressure head (see docs/ML-RISK.md)
ALTER TABLE "ProjectRiskEvaluation" ADD COLUMN "mlPrediction" JSONB;
ALTER TABLE "RiskEvaluationRun" ADD COLUMN "mlPrediction" JSONB;
