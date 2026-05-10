/** Pulse placeholder — use min-h-* + w-* via className. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block rounded-lg bg-zinc-200/85 animate-pulse dark:bg-zinc-700/55 ${className}`}
      aria-hidden
    />
  );
}
