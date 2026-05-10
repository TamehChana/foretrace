import { Sparkles } from 'lucide-react';

export function RoadmapCard() {
  return (
    <section
      aria-labelledby="roadmap-heading"
      className="animate-rise rounded-2xl border border-accent-400/25 bg-gradient-to-br from-accent-50/95 via-white to-accent-50/40 p-[1px] shadow-sm dark:border-accent-600/30 dark:from-accent-950/55 dark:via-zinc-950/70 dark:to-accent-950/30"
      style={{ animationDelay: '320ms' }}
    >
      <div className="rounded-[15px] p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700 dark:bg-accent-400/15 dark:text-accent-200">
            <Sparkles size={20} strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="roadmap-heading" className="text-sm font-semibold text-accent-950 dark:text-accent-100">
              Product runway
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-accent-900/92 dark:text-accent-200/90">
              Next milestones: authenticated orgs · project & task CRUD · GitHub ingestion · alerting
              & inbox · fused risk scoring with PM-facing narrative blurbs—all built on top of this
              surface.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
