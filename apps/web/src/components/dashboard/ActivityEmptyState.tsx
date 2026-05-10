import { GitBranch, Waves } from 'lucide-react';

export function ActivityEmptyState() {
  return (
    <section
      className="group relative overflow-hidden rounded-2xl border border-zinc-200/85 bg-white/95 p-[1px] shadow-md shadow-zinc-900/[0.04] dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-black/35"
      aria-labelledby="signals-empty-heading"
    >
      <div className="relative overflow-hidden rounded-[15px] bg-gradient-to-b from-white via-white to-zinc-50/90 px-6 py-14 text-center dark:from-zinc-900/80 dark:via-zinc-950/90 dark:to-zinc-950">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(to_bottom,rgba(13,148,136,0.07),transparent)] dark:bg-[linear-gradient(to_bottom,rgba(45,212,191,0.05),transparent)]"
          aria-hidden
        />

        <div className="relative mx-auto mb-8 flex max-w-[min(340px,100%)] flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-[-8px] rounded-3xl bg-accent-400/15 blur-xl transition-opacity duration-500 group-hover:opacity-70 dark:bg-accent-500/12" aria-hidden />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-100 ring-8 ring-white/90 dark:bg-zinc-800 dark:ring-zinc-950">
              <Waves className="text-accent-600 dark:text-accent-400" size={30} strokeWidth={1.6} aria-hidden />
            </div>
          </div>

          {/* Decorative spark line — illustrative only */}
          <svg
            className="h-14 w-full text-accent-400/65 dark:text-accent-500/50"
            viewBox="0 0 340 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M0 42c42-38 74-54 126-42 38 10 74 40 126 46 62 7 88-52 88-52"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
            <circle cx="88" cy="18" r="3" fill="currentColor" opacity="0.9" />
            <circle cx="188" cy="36" r="3" fill="currentColor" opacity="0.85" />
            <circle cx="268" cy="12" r="3" fill="currentColor" opacity="0.8" />
          </svg>

          <div className="space-y-3">
            <h3 id="signals-empty-heading" className="text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50">
              Fused signals will appear here
            </h3>
            <p className="text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Connect GitHub, stream the CLI, and align commits with tasks—we’ll correlate delivery
              risk with citations your team can trust.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="relative inline-flex items-center gap-2 rounded-xl border border-zinc-200/95 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-400 shadow-sm cursor-not-allowed ring-zinc-900/[0.02] ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900/80"
        >
          <GitBranch size={17} aria-hidden />
          Connect GitHub
        </button>
        <p className="relative mt-4 text-[11px] text-zinc-400 dark:text-zinc-600">
          OAuth handshake and webhook verification ship with the integrations milestone.
        </p>
      </div>
    </section>
  );
}
