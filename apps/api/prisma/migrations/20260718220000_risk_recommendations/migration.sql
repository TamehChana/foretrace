-- Structured PM recommendations on latest + history risk rows (rule-engine derived).
ALTER TABLE "ProjectRiskEvaluation" ADD COLUMN IF NOT EXISTS "recommendations" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "RiskEvaluationRun" ADD COLUMN IF NOT EXISTS "recommendations" JSONB NOT NULL DEFAULT '[]'::jsonb;
