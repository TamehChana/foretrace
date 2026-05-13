import { useCallback, useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';
import { readApiErrorMessage } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useGithubUserLinks } from '../../hooks/use-github-user-links';
import { useProjectGithub } from '../../hooks/use-project-github';
import { useToast } from '../../providers/ToastProvider';
import { Skeleton } from '../ui/Skeleton';

/**
 * Lets organization members (including developers) map **their own** GitHub
 * username to their Foretrace account for webhook attribution. PM/admin full
 * GitHub panel can still map any member.
 */
export function ProjectGithubSelfLinkCard(props: {
  organizationId: string;
  projectId: string;
  currentUserId: string | null;
  refreshKey: number;
  onRefresh: () => void;
}) {
  const {
    organizationId,
    projectId,
    currentUserId,
    refreshKey,
    onRefresh,
  } = props;
  const showToast = useToast();
  const githubState = useProjectGithub(
    organizationId,
    projectId,
    refreshKey,
  );
  const connected =
    githubState.status === 'ok' && githubState.connected === true;
  const linksState = useGithubUserLinks(
    organizationId,
    projectId,
    refreshKey,
    connected,
  );

  const [linkLogin, setLinkLogin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!currentUserId) {
        return;
      }
      const login = linkLogin.trim().toLowerCase();
      if (!login) {
        return;
      }
      setSubmitting(true);
      try {
        const res = await apiFetch(
          `/organizations/${organizationId}/projects/${projectId}/github/user-links`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              githubLogin: login,
              userId: currentUserId,
            }),
          },
        );
        if (!res.ok) {
          showToast(await readApiErrorMessage(res), 'error');
          return;
        }
        setLinkLogin('');
        onRefresh();
        showToast('GitHub login linked to your account', 'success');
      } catch (err: unknown) {
        showToast(
          err instanceof Error ? err.message : 'Request failed',
          'error',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      currentUserId,
      linkLogin,
      organizationId,
      projectId,
      onRefresh,
      showToast,
    ],
  );

  const onRemove = useCallback(
    async (linkId: string, githubLogin: string) => {
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Remove your mapping for ${githubLogin}?`)
      ) {
        return;
      }
      setDeleteBusy(linkId);
      try {
        const res = await apiFetch(
          `/organizations/${organizationId}/projects/${projectId}/github/user-links/${linkId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          showToast(await readApiErrorMessage(res), 'error');
          return;
        }
        onRefresh();
        showToast('Mapping removed', 'success');
      } catch (err: unknown) {
        showToast(
          err instanceof Error ? err.message : 'Request failed',
          'error',
        );
      } finally {
        setDeleteBusy(null);
      }
    },
    [organizationId, projectId, onRefresh, showToast],
  );

  if (githubState.status === 'loading' || githubState.status === 'idle') {
    return <Skeleton className="mt-4 h-20 w-full" />;
  }
  if (githubState.status === 'error') {
    return (
      <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-[12px] text-rose-600 dark:text-rose-400">
          Could not load GitHub status: {githubState.message}
        </p>
      </div>
    );
  }
  if (!connected) {
    return (
      <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            GitHub mapping.
          </span>{' '}
          This project does not have a repository connected yet. Ask a PM or
          admin to connect GitHub first; then you can link your GitHub username
          here so task activity shows your Foretrace name.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-zinc-500" aria-hidden />
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Your GitHub login
        </h4>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Link your GitHub <strong className="font-medium text-zinc-700 dark:text-zinc-300">username</strong>{' '}
        (from <code className="text-[11px]">github.com/username</code>, no{' '}
        <code className="text-[11px]">@</code>) to your Foretrace account so
        “last GitHub activity” on tasks can show your name when you push or
        comment. You can remove your mapping anytime.
      </p>
      {linksState.status === 'loading' || linksState.status === 'idle' ? (
        <Skeleton className="mt-2 h-8 w-full" />
      ) : linksState.status === 'error' ? (
        <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-400">
          {linksState.message}
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-1">
            {linksState.links.map((lnk) => (
              <li
                key={lnk.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-[12px] dark:bg-zinc-900"
              >
                <span>
                  <code>{lnk.githubLogin}</code>
                  <span className="text-zinc-400"> → </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {lnk.user.email}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={deleteBusy === lnk.id}
                  className="rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  onClick={() => void onRemove(lnk.id, lnk.githubLogin)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(ev) => void onSubmit(ev)}
          >
            <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              GitHub username
              <input
                type="text"
                value={linkLogin}
                onChange={(e) => setLinkLogin(e.target.value)}
                disabled={!currentUserId || submitting}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={!currentUserId || submitting || !linkLogin.trim()}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Link to me
            </button>
          </form>
        </>
      )}
    </div>
  );
}
