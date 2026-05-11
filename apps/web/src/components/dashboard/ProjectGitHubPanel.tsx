import {
  useCallback,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ClipboardCopy, Link2, Link2Off, Plus, UserPlus } from 'lucide-react';
import { readApiErrorMessage } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import {
  type GithubRecentEventRow,
  useProjectGithub,
} from '../../hooks/use-project-github';
import { useGithubUserLinks } from '../../hooks/use-github-user-links';
import { useToast } from '../../providers/ToastProvider';
import { Skeleton } from '../ui/Skeleton';

type RevealedCreds = { webhookSecret: string; webhookUrl: string };

function formatWhen(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function RecentEventsTable({ events }: { events: GithubRecentEventRow[] }) {
  return (
    <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
      <table className="w-full min-w-[420px] text-left text-[12px]">
        <thead className="sticky top-0 bg-zinc-100/95 dark:bg-zinc-900/95">
          <tr className="text-zinc-500">
            <th className="px-2 py-1.5 font-medium">When</th>
            <th className="px-2 py-1.5 font-medium">Type</th>
            <th className="px-2 py-1.5 font-medium">Action</th>
            <th className="px-2 py-1.5 font-medium">Actor</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr
              key={ev.id}
              className="border-t border-zinc-100 odd:bg-white/70 dark:border-zinc-800 odd:dark:bg-zinc-950/40"
            >
              <td className="whitespace-nowrap px-2 py-1 text-zinc-600 dark:text-zinc-400">
                {formatWhen(ev.createdAt)}
              </td>
              <td className="px-2 py-1 font-medium text-zinc-800 dark:text-zinc-200">
                {ev.eventType}
              </td>
              <td className="px-2 py-1 text-zinc-600 dark:text-zinc-400">
                {ev.action ?? '—'}
              </td>
              <td className="truncate px-2 py-1 text-zinc-600 dark:text-zinc-400">
                {ev.actorLogin ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectGitHubPanel(props: {
  organizationId: string;
  projectId: string;
  canManage: boolean;
  refreshKey: number;
  onRefresh: () => void;
}) {
  const { organizationId, projectId, canManage, refreshKey, onRefresh } =
    props;

  const showToast = useToast();
  const githubState = useProjectGithub(
    organizationId,
    projectId,
    refreshKey,
  );

  const hasGithubConnection =
    githubState.status === 'ok' && githubState.connected;

  const linksState = useGithubUserLinks(
    organizationId,
    projectId,
    refreshKey,
    hasGithubConnection,
  );

  const [repoFullNameInput, setRepoFullNameInput] = useState('');
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [disconnectSubmitting, setDisconnectSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<RevealedCreds | null>(null);

  const [linkLogin, setLinkLogin] = useState('');
  const [linkUserId, setLinkUserId] = useState('');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkDeleteBusy, setLinkDeleteBusy] = useState<string | null>(null);

  const [githubPatInput, setGithubPatInput] = useState('');
  const [patSaveBusy, setPatSaveBusy] = useState(false);
  const [patClearBusy, setPatClearBusy] = useState(false);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied`, 'success');
      } catch {
        showToast('Could not copy to clipboard', 'error');
      }
    },
    [showToast],
  );

  const onConnect = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = repoFullNameInput.trim().toLowerCase();
    if (!trimmed.includes('/')) {
      showToast('Use owner/repo (e.g. acme/widget)', 'error');
      return;
    }
    setConnectSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/github`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repositoryFullName: trimmed }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      const payload = (await res.json()) as {
        data?: { webhookSecret?: string; webhookUrl?: string };
      };
      const d = payload?.data;
      if (d?.webhookSecret && d?.webhookUrl) {
        setRevealed({ webhookSecret: d.webhookSecret, webhookUrl: d.webhookUrl });
      }
      setRepoFullNameInput('');
      onRefresh();
      showToast(
        'GitHub repository linked — configure the webhook in GitHub.',
        'success',
      );
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setConnectSubmitting(false);
    }
  };

  const onDisconnect = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Disconnect GitHub? Webhook deliveries stop; stored events will be deleted.',
      )
    ) {
      return;
    }
    setDisconnectSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/github`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      setRevealed(null);
      onRefresh();
      showToast('GitHub disconnected', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setDisconnectSubmitting(false);
    }
  };

  const onCreateUserLink = async (e: FormEvent) => {
    e.preventDefault();
    const login = linkLogin.trim().toLowerCase();
    const uid = linkUserId.trim();
    if (!login || !uid) {
      return;
    }
    setLinkSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/github/user-links`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ githubLogin: login, userId: uid }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      setLinkLogin('');
      setLinkUserId('');
      onRefresh();
      showToast('GitHub user linked', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setLinkSubmitting(false);
    }
  };

  const onRemoveUserLink = async (linkId: string, githubLogin: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Remove mapping for ${githubLogin}?`)
    ) {
      return;
    }
    setLinkDeleteBusy(linkId);
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
      setLinkDeleteBusy(null);
    }
  };

  let body: ReactNode = null;

  if (githubState.status === 'loading') {
    body = <Skeleton className="mt-2 h-24 w-full" />;
  } else if (githubState.status === 'error') {
    body = (
      <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
        {githubState.message}
      </p>
    );
  } else if (githubState.status === 'ok' && githubState.connected === false) {
    body = (
      <>
        <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">
          Link a repo to receive signed GitHub webhooks and show recent delivery
          events here.
        </p>
        {canManage ? (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(ev) => {
              void onConnect(ev);
            }}
          >
            <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Repository (<code className="text-[11px]">owner/repo</code>)
              <input
                type="text"
                value={repoFullNameInput}
                onChange={(e) => setRepoFullNameInput(e.target.value)}
                placeholder="your-org/your-repo"
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={connectSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <Plus size={18} aria-hidden />
              Connect
            </button>
          </form>
        ) : (
          <p className="mt-3 text-[13px] text-zinc-500">
            Only PM or organization admin can connect a GitHub repository.
          </p>
        )}
      </>
    );
  } else if (githubState.status === 'ok' && githubState.connected === true) {
    const conn = githubState.connection;
    body = (
      <>
        <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          <code className="rounded bg-white px-2 py-0.5 text-[13px] dark:bg-zinc-900">
            {conn.repositoryFullName}
          </code>
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
          <div>
            <dt className="font-medium text-zinc-500">Last event</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {formatWhen(conn.lastEventAt)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Last push</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {formatWhen(conn.lastPushAt)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Open PRs (approx.)</dt>
            <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
              {conn.openPullRequestCount}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">Open issues (approx.)</dt>
            <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
              {conn.openIssueCount}
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            GitHub REST enrichment
          </p>
          <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-400">
            Optional fine-grained or classic PAT with{' '}
            <code className="text-[11px]">repo</code> (and search scope for open
            PR counts). Stored encrypted server-side; never shown again. Improves
            signal snapshots when <code className="text-[11px]">FORETRACE_APP_SECRET</code>{' '}
            is configured on the API.
          </p>
          <p className="mt-2 text-[12px]">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Status:{' '}
            </span>
            {conn.hasGithubRestPat ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                PAT on file — REST fields appear in Signals after refresh.
              </span>
            ) : (
              <span className="text-zinc-500">No PAT — webhook counts only.</span>
            )}
          </p>
          {canManage ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                New token (paste once)
                <input
                  type="password"
                  value={githubPatInput}
                  onChange={(e) => setGithubPatInput(e.target.value)}
                  placeholder="ghp_… or github_pat_…"
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={patSaveBusy || githubPatInput.trim().length < 10}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    void (async () => {
                      const pat = githubPatInput.trim();
                      if (pat.length < 10) {
                        return;
                      }
                      setPatSaveBusy(true);
                      try {
                        const res = await apiFetch(
                          `/organizations/${organizationId}/projects/${projectId}/github/pat`,
                          {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pat }),
                          },
                        );
                        if (!res.ok) {
                          showToast(await readApiErrorMessage(res), 'error');
                          return;
                        }
                        setGithubPatInput('');
                        onRefresh();
                        showToast('GitHub PAT saved', 'success');
                      } catch (err: unknown) {
                        showToast(
                          err instanceof Error ? err.message : 'Request failed',
                          'error',
                        );
                      } finally {
                        setPatSaveBusy(false);
                      }
                    })();
                  }}
                >
                  Save PAT
                </button>
                <button
                  type="button"
                  disabled={patClearBusy || !conn.hasGithubRestPat}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => {
                    void (async () => {
                      if (
                        typeof window !== 'undefined' &&
                        !window.confirm('Remove stored GitHub PAT?')
                      ) {
                        return;
                      }
                      setPatClearBusy(true);
                      try {
                        const res = await apiFetch(
                          `/organizations/${organizationId}/projects/${projectId}/github/pat`,
                          { method: 'DELETE' },
                        );
                        if (!res.ok) {
                          showToast(await readApiErrorMessage(res), 'error');
                          return;
                        }
                        onRefresh();
                        showToast('GitHub PAT removed', 'success');
                      } catch (err: unknown) {
                        showToast(
                          err instanceof Error ? err.message : 'Request failed',
                          'error',
                        );
                      } finally {
                        setPatClearBusy(false);
                      }
                    })();
                  }}
                >
                  Clear PAT
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {revealed ? (
          <div
            className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-950/35"
            role="status"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              Save these now — webhook secret cannot be retrieved later
            </p>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-zinc-600 dark:text-zinc-400">
                  Webhook URL
                </span>
                <code className="min-w-0 break-all rounded bg-white/80 px-2 py-1 text-[12px] dark:bg-zinc-900">
                  {revealed.webhookUrl}
                </code>
                <button
                  type="button"
                  title="Copy URL"
                  className="inline-flex items-center rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900"
                  onClick={() =>
                    copy(revealed.webhookUrl, 'Webhook URL').catch(() => undefined)
                  }
                >
                  <ClipboardCopy size={14} className="mr-1 inline" aria-hidden />
                  Copy
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-zinc-600 dark:text-zinc-400">
                  Secret
                </span>
                <code className="min-w-0 flex-1 break-all rounded bg-white/80 px-2 py-1 text-[12px] dark:bg-zinc-900">
                  {revealed.webhookSecret}
                </code>
                <button
                  type="button"
                  title="Copy secret"
                  className="inline-flex items-center rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900"
                  onClick={() =>
                    copy(
                      revealed.webhookSecret,
                      'Webhook secret',
                    ).catch(() => undefined)
                  }
                >
                  <ClipboardCopy size={14} className="mr-1 inline" aria-hidden />
                  Copy
                </button>
              </div>
              <p className="text-[12px] text-amber-900/90 dark:text-amber-200/90">
                In GitHub: Settings → Webhooks → Add webhook. Content type:
                application/json.
              </p>
            </div>
          </div>
        ) : canManage ? (
          <p className="mt-4 text-[12px] text-zinc-500">
            To reuse a new secret from GitHub without losing history, disconnect
            and reconnect when we add editable secrets — or keep your existing
            webhook as configured.
          </p>
        ) : null}

        {canManage ? (
          <button
            type="button"
            disabled={disconnectSubmitting}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/70 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
            onClick={() => {
              void onDisconnect();
            }}
          >
            <Link2Off size={16} aria-hidden />
            Disconnect GitHub
          </button>
        ) : null}

        <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Recent webhook events
          </h4>
          {conn.recentEvents.length === 0 ? (
            <p className="mt-2 text-[13px] text-zinc-500">
              No deliveries yet — push commits after configuring GitHub webhook.
            </p>
          ) : (
            <RecentEventsTable events={conn.recentEvents} />
          )}
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h4 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <UserPlus size={14} aria-hidden />
            GitHub ↔ Foretrace user mapping
          </h4>
          <p className="mt-1 text-[12px] text-zinc-500">
            {canManage
              ? 'Link a collaborator’s GitHub login to their Foretrace user ID (members only). Developers can view mappings.'
              : 'Mappings are managed by PM and admin.'}
          </p>
          {linksState.status === 'loading' || linksState.status === 'idle' ? (
            <Skeleton className="mt-2 h-8 w-full" />
          ) : linksState.status === 'error' ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              {linksState.message}
            </p>
          ) : linksState.status === 'ok' ? (
            <>
              <ul className="mt-2 space-y-1">
                {linksState.links.map((lnk) => (
                  <li
                    key={lnk.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-[12px] dark:bg-zinc-900"
                  >
                    <span>
                      <code>{lnk.githubLogin}</code>{' '}
                      <span className="text-zinc-400">→</span>{' '}
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {lnk.user.email}
                      </span>
                    </span>
                    {canManage ? (
                      <button
                        type="button"
                        disabled={linkDeleteBusy === lnk.id}
                        className="rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        onClick={() =>
                          void onRemoveUserLink(lnk.id, lnk.githubLogin)
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage ? (
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                  onSubmit={(ev) => {
                    void onCreateUserLink(ev);
                  }}
                >
                  <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    GitHub login
                    <input
                      type="text"
                      value={linkLogin}
                      onChange={(e) => setLinkLogin(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Foretrace user ID (UUID)
                    <input
                      type="text"
                      value={linkUserId}
                      onChange={(e) => setLinkUserId(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-950"
                      spellCheck={false}
                      autoCapitalize="off"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={linkSubmitting}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Add
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-zinc-100 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="text-zinc-500" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          GitHub
        </h3>
      </div>
      {body}
    </div>
  );
}
