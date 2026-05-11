import { useCallback } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { useToast } from '../../providers/ToastProvider';

/**
 * Shows the signed-in user’s Foretrace account UUID with a copy button (GitHub mapping, support).
 */
export function UserIdCopyRow({
  userId,
  className = '',
}: {
  userId: string | null | undefined;
  className?: string;
}) {
  const showToast = useToast();

  const copy = useCallback(async () => {
    if (!userId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(userId);
      showToast('Foretrace user ID copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }, [userId, showToast]);

  if (!userId) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/50 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Your Foretrace user ID
          </p>
          <p
            className="mt-0.5 truncate font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
            title={userId}
          >
            {userId}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
          title="Copy Foretrace user ID"
        >
          <ClipboardCopy size={14} strokeWidth={2} aria-hidden />
          Copy
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
        Use when linking your GitHub login in a project’s GitHub panel. Same value as{' '}
        <span className="font-mono">user.id</span> in <span className="font-mono">GET /auth/me</span>.
      </p>
    </div>
  );
}
