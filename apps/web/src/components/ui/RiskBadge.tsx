import type { ReactNode } from 'react';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export function isRiskLevel(v: unknown): v is RiskLevel {
  return v === 'LOW' || v === 'MEDIUM' || v === 'HIGH' || v === 'CRITICAL';
}

export function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case 'LOW':
      return 'bg-emerald-100 text-emerald-900 ring-emerald-600/15 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-400/20';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-950 ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-400/20';
    case 'HIGH':
      return 'bg-orange-200 text-orange-950 ring-orange-600/20 dark:bg-orange-950/60 dark:text-orange-100 dark:ring-orange-400/25';
    case 'CRITICAL':
      return 'bg-rose-200 text-rose-950 ring-rose-600/20 dark:bg-rose-950/70 dark:text-rose-50 dark:ring-rose-400/25';
    default:
      return 'bg-zinc-200 text-zinc-900 ring-zinc-500/15 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-400/20';
  }
}

type Props = {
  level: RiskLevel;
  /** Optional score shown after the level, e.g. "53". */
  score?: number | null;
  className?: string;
  children?: ReactNode;
};

export function RiskBadge({ level, score, className = '', children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${riskBadgeClass(level)} ${className}`}
    >
      {children ?? level}
      {typeof score === 'number' && Number.isFinite(score) ? (
        <span className="font-semibold tabular-nums opacity-80 normal-case tracking-normal">
          {Math.round(score)}
        </span>
      ) : null}
    </span>
  );
}
