import type { LucideIcon } from 'lucide-react';

type Props = {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  /** Stagger dashboard entrance; pairs with `.animate-rise` in global CSS */
  enterDelayMs?: number;
};

export function MetricCard({ title, value, subtitle, icon: Icon, enterDelayMs = 0 }: Props) {
  return (
    <div
      className="animate-rise group relative overflow-hidden rounded-2xl border border-zinc-200/75 bg-white/90 p-[1px] shadow-sm shadow-zinc-900/[0.03] backdrop-blur-sm motion-safe:transition-[box-shadow,transform,border-color] motion-safe:hover:-translate-y-0.5 hover:border-accent-300/55 motion-safe:hover:shadow-lg motion-safe:hover:shadow-zinc-900/[0.06] dark:border-zinc-800/80 dark:bg-zinc-900/55 dark:shadow-black/40 dark:hover:border-accent-600/45 dark:motion-safe:hover:shadow-black/60"
      style={{ animationDelay: `${enterDelayMs}ms` }}
    >
      <div className="relative overflow-hidden rounded-[15px] bg-gradient-to-br from-white via-white to-zinc-50/90 p-5 dark:from-zinc-900/90 dark:via-zinc-900/80 dark:to-zinc-950/90">
        <div
          className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent-400/15 blur-2xl transition-opacity duration-500 group-hover:opacity-100 dark:bg-accent-400/10"
          aria-hidden
        />
        <div className="relative flex flex-col gap-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              {title}
            </p>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-700 ring-1 ring-accent-500/15 transition-transform duration-300 group-hover:scale-105 group-hover:bg-accent-500/[0.14] dark:text-accent-300 dark:ring-accent-400/20">
              <Icon size={19} strokeWidth={2} aria-hidden />
            </span>
          </div>
          <p className="text-[2rem] font-semibold tabular-nums tracking-[-0.04em] leading-none text-zinc-950 dark:text-white">
            {value}
          </p>
          <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
