import { ArrowLeft, Bell, Loader } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../ui/PageHeader';

export function AlertsPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Delivery signals"
        title="Alerts"
        description="Rule-based notifications when risk climbs, branches go stale, or reviews stall. Routing is live; alert rules and delivery channels land with backend auth."
        meta={
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition-[box-shadow,transform] hover:border-zinc-300 hover:shadow-md active:scale-[0.99] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
          >
            <ArrowLeft size={14} strokeWidth={2.5} aria-hidden />
            Back to overview
          </Link>
        }
      />

      <div className="animate-rise rounded-2xl border border-dashed border-zinc-300/90 bg-white/80 p-10 text-center shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/40">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-800 ring-1 ring-accent-400/25 dark:text-accent-200 dark:ring-accent-500/30">
          <Bell size={28} strokeWidth={1.75} aria-hidden />
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Inbox is quiet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This is the real <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">/alerts</code> route.
          When wired, unread items and digests appear here—stubbed UI until persistence exists.
        </p>
        <button
          type="button"
          disabled
          title="Alert rules ship with authenticated API"
          className="mt-7 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-400 cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-600"
        >
          <Loader size={18} strokeWidth={2} aria-hidden />
          Configure rules
        </button>
      </div>
    </main>
  );
}
