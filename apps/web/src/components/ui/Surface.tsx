import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  id?: string;
};

/** Standard dashboard surface — Linear/Vercel-style quiet panel. */
export function Surface({ children, className = '', id }: Props) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-zinc-200/90 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.03)] dark:border-zinc-800/90 dark:bg-zinc-950/70 dark:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}

type CalloutProps = {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger';
  className?: string;
};

const TONE: Record<NonNullable<CalloutProps['tone']>, string> = {
  neutral:
    'border-zinc-200/90 bg-zinc-50/80 text-zinc-800 dark:border-zinc-700/80 dark:bg-zinc-900/50 dark:text-zinc-200',
  accent:
    'border-accent-200/80 bg-accent-50/70 text-accent-950 dark:border-accent-900/50 dark:bg-accent-950/25 dark:text-accent-100',
  warning:
    'border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100',
  danger:
    'border-rose-200/90 bg-rose-50/80 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100',
};

export function Callout({
  children,
  tone = 'neutral',
  className = '',
}: CalloutProps) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${TONE[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
