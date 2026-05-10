/** Compact logomark: signal bars ascending (early warning motif). */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="4" y="18" width="5" height="10" rx="1.5" className="fill-accent-500" />
      <rect x="13.5" y="12" width="5" height="16" rx="1.5" className="fill-accent-600" />
      <rect x="23" y="4" width="5" height="24" rx="1.5" className="fill-accent-700 dark:fill-accent-400" />
    </svg>
  );
}
