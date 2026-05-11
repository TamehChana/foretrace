-- Optional narrative for PM-facing risk explanations (heuristic + optional LLM).
ALTER TABLE "ProjectRiskEvaluation" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
ALTER TABLE "RiskEvaluationRun" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
