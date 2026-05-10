import { Home, Radar } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <main className="mx-auto max-w-lg py-8 text-center sm:py-16">
      <div className="animate-rise mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-900 ring-1 ring-amber-400/30 dark:text-amber-100 dark:ring-amber-500/35">
        <Radar size={32} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-800/90 dark:text-amber-300/95">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">
        Page not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Nothing lives at{' '}
        <code className="rounded-lg bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          {pathname || '/'}
        </code>
        . Check the URL or jump back to the overview.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm transition-[box-shadow,transform] hover:border-accent-300 hover:shadow-md active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-accent-600"
      >
        <Home size={17} strokeWidth={2} aria-hidden />
        Back to overview
      </Link>
    </main>
  );
}
