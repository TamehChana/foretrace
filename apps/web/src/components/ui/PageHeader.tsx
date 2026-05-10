import type { ReactNode } from 'react';

type Props = {
  eyebrow: string;
  title: string;
  description: ReactNode;
  meta?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, meta }: Props) {
  return (
    <header className="mb-10 animate-rise">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent-700 dark:text-accent-400">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.03em] text-zinc-950 sm:text-[2rem] lg:text-[2.25rem] dark:text-white">
            {title}
          </h1>
          <div className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {description}
          </div>
        </div>
        {meta ? (
          <div className="shrink-0 rounded-xl border border-zinc-200/90 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            {meta}
          </div>
        ) : null}
      </div>
    </header>
  );
}
