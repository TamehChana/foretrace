import { AlertCircle, CheckCircle2, Loader2, PlugZap } from 'lucide-react';
import { API_NAME } from '@foretrace/shared';
import type { ApiHealthState } from '../../hooks/use-api-health';
import { Skeleton } from '../ui/Skeleton';

export function ApiHealthPanel({ state }: { state: ApiHealthState }) {
  return (
    <section
      className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/55"
      aria-labelledby="integration-status-heading"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700/80">
          <PlugZap size={22} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="integration-status-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              API handshake
            </h2>
            <StatusBadge state={state} />
          </div>

          {state.status === 'ok' ? (
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-zinc-100 pb-3 dark:border-zinc-800/90">
                <dt className="text-zinc-500 dark:text-zinc-400">Service</dt>
                <dd className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                  {state.payload.service}
                </dd>
              </div>
              <div className="flex justify-between gap-4 pb-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Version</dt>
                <dd className="font-mono text-xs font-medium text-accent-700 dark:text-accent-300">
                  {state.payload.version}
                </dd>
              </div>
              <div className="overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50/95 dark:border-zinc-800 dark:bg-black/35">
                <pre className="m-0 max-h-36 overflow-auto p-3 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 ft-scrollbar">
                  {JSON.stringify(state.payload, null, 2)}
                </pre>
              </div>
            </dl>
          ) : state.status === 'loading' ? (
            <div className="space-y-3 pt-1" aria-busy="true" aria-label="Loading API status">
              <Skeleton className="h-4 w-[60%] max-w-[12rem]" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-2.5 rounded-xl bg-rose-50/80 p-4 text-[13px] leading-relaxed text-rose-900/95 dark:bg-rose-950/35 dark:text-rose-100/95">
              <p className="font-medium">Could not reach the API ({state.message}).</p>
              <p>
                Locally: run{' '}
                <kbd className="rounded border border-rose-200/90 bg-white px-1.5 py-0.5 font-mono text-[11px] dark:border-rose-800 dark:bg-zinc-900">
                  turbo dev
                </kbd>{' '}
                (Nest listens on{' '}
                <span className="font-mono text-[11px]">localhost:3000</span>). Vite proxies{' '}
                <span className="font-mono text-[11px]">/health</span>.
              </p>
              <p className="text-rose-800/92 dark:text-rose-200/85">
                Hosted: configure <kbd className="font-mono text-[11px]">VITE_API_URL</kbd> on Vercel
                and matching <kbd className="font-mono text-[11px]">CORS_ORIGINS</kbd> on Render (
                <span className="font-mono text-[11px]">{API_NAME}</span>).
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ state }: { state: ApiHealthState }) {
  if (state.status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200/90 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-700/65">
        <Loader2 className="animate-spin" size={12} aria-hidden />
        Checking
      </span>
    );
  }
  if (state.status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/95 dark:bg-emerald-950/55 dark:text-emerald-300 dark:ring-emerald-700/60">
        <CheckCircle2 size={12} aria-hidden />
        Operational
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-900 ring-1 ring-rose-200/90 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-700/60">
      <AlertCircle size={12} aria-hidden />
      Offline
    </span>
  );
}
