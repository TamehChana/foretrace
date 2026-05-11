import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Plus,
  Trash2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { readApiErrorMessage } from '../../api-error-message';
import { apiFetch } from '../../api-fetch';
import { useOrganizations } from '../../hooks/use-organizations';
import { useOrgMemberRole } from '../../hooks/use-org-member-role';
import { useOrgProjects } from '../../hooks/use-org-projects';
import { type OrgTaskRow, useOrgTasks } from '../../hooks/use-org-tasks';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { useToast } from '../../providers/ToastProvider';
import { OrganizationIdCopyRow } from '../ui/OrganizationIdCopyRow';
import { PageHeader } from '../ui/PageHeader';
import { ProjectCliTokensPanel } from './ProjectCliTokensPanel';
import { ProjectRiskPanel } from './ProjectRiskPanel';
import { ProjectTerminalIncidentsPanel } from './ProjectTerminalIncidentsPanel';
import { ProjectGitHubPanel } from './ProjectGitHubPanel';
import { ProjectSignalsPanel } from './ProjectSignalsPanel';
import { Skeleton } from '../ui/Skeleton';

export function ProjectsPage() {
  const organizations = useOrganizations();
  const { snapshot, openAuthModal, bumpWorkspaceList } = useAuthSession();
  const showToast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawOrgParam = searchParams.get('org');

  const [dataBump, setDataBump] = useState(0);
  const bumpData = useCallback(() => {
    setDataBump((n) => n + 1);
  }, []);

  const organizationId = useMemo(() => {
    if (organizations.status !== 'ok') {
      return null;
    }
    const ids = organizations.items.map((o) => o.id);
    if (ids.length === 0) {
      return null;
    }
    if (rawOrgParam && ids.includes(rawOrgParam)) {
      return rawOrgParam;
    }
    return ids[0] ?? null;
  }, [organizations, rawOrgParam]);

  useEffect(() => {
    if (organizations.status !== 'ok') {
      return;
    }
    const ids = organizations.items.map((o) => o.id);
    if (ids.length === 0) {
      if (rawOrgParam) {
        setSearchParams({}, { replace: true });
      }
      return;
    }
    const valid =
      rawOrgParam && ids.includes(rawOrgParam) ? rawOrgParam : ids[0];
    if (!rawOrgParam || rawOrgParam !== valid) {
      setSearchParams({ org: valid }, { replace: true });
    }
  }, [organizations, rawOrgParam, setSearchParams]);

  const memberRole = useOrgMemberRole(organizationId);
  const projectsState = useOrgProjects(organizationId, dataBump);

  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );

  const tasksState = useOrgTasks(
    organizationId,
    expandedProjectId,
    dataBump,
  );

  const [newProjectName, setNewProjectName] = useState('');
  const [projectSubmitting, setProjectSubmitting] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'PM' | 'DEVELOPER'>('DEVELOPER');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [taskTitleByProject, setTaskTitleByProject] = useState<
    Record<string, string>
  >({});
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  const role = memberRole.status === 'ok' ? memberRole.role : null;
  const cliPanelRole =
    role === 'ADMIN' || role === 'PM' || role === 'DEVELOPER'
      ? (role as 'ADMIN' | 'PM' | 'DEVELOPER')
      : null;
  const canManageProjects = role === 'ADMIN' || role === 'PM';
  const canInvite = role === 'ADMIN';
  const currentUserId =
    snapshot.status === 'ready' && snapshot.user?.id
      ? snapshot.user.id
      : null;

  const canDeleteThisTask = useCallback(
    (task: OrgTaskRow): boolean => {
      if (!currentUserId || !role) {
        return false;
      }
      if (role === 'ADMIN' || role === 'PM') {
        return true;
      }
      if (role === 'DEVELOPER') {
        return task.createdById === currentUserId;
      }
      return false;
    },
    [currentUserId, role],
  );

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !newProjectName.trim()) {
      return;
    }
    setProjectSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newProjectName.trim() }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      setNewProjectName('');
      bumpData();
      showToast('Project created', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setProjectSubmitting(false);
    }
  };

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || !inviteEmail.trim()) {
      return;
    }
    setInviteSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            role: inviteRole,
          }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      setInviteEmail('');
      bumpWorkspaceList();
      showToast('Member added', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setInviteSubmitting(false);
    }
  };

  const archiveProject = async (projectId: string) => {
    if (!organizationId) {
      return;
    }
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: true }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      if (expandedProjectId === projectId) {
        setExpandedProjectId(null);
      }
      bumpData();
      showToast('Project archived', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    }
  };

  const createTask = async (projectId: string) => {
    if (!organizationId) {
      return;
    }
    const title = (taskTitleByProject[projectId] ?? '').trim();
    if (!title) {
      return;
    }
    setTaskSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      setTaskTitleByProject((prev) => ({ ...prev, [projectId]: '' }));
      bumpData();
      showToast('Task added', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setTaskSubmitting(false);
    }
  };

  const deleteTask = async (projectId: string, taskId: string) => {
    if (!organizationId) {
      return;
    }
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      bumpData();
      showToast('Task removed', 'success');
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    }
  };

  return (
    <main>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Organization-scoped projects and tasks. Admins can add existing users as PM or developer; PMs and admins manage projects and archive them when done."
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

      {organizations.status === 'loading' ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : organizations.status === 'signed_out' ? (
        <div className="rounded-2xl border border-zinc-200/80 bg-white/95 p-8 dark:border-zinc-800/80 dark:bg-zinc-900/55">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sign in to load your organizations and projects.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="mt-4 rounded-xl border border-accent-300/70 bg-accent-500/10 px-4 py-2 text-xs font-semibold text-accent-900 shadow-sm transition hover:bg-accent-500/15 dark:border-accent-600/35 dark:bg-accent-500/12 dark:text-accent-100"
          >
            Sign in
          </button>
        </div>
      ) : organizations.status === 'error' ? (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          {organizations.message}
        </p>
      ) : organizations.items.length === 0 ? (
        <div className="animate-rise rounded-2xl border border-dashed border-zinc-300/90 bg-white/80 p-10 text-center shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/40">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500/12 text-accent-800 ring-1 ring-accent-400/25 dark:text-accent-200 dark:ring-accent-500/30">
            <FolderKanban size={28} strokeWidth={1.75} aria-hidden />
          </div>
          <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            No organization yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Create an organization from the overview, then return here to add
            projects and tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
              Organization
              <select
                className="mt-1 block w-full max-w-md rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                value={organizationId ?? ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setSearchParams(id ? { org: id } : {}, { replace: true });
                  setExpandedProjectId(null);
                }}
              >
                {organizations.items.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            {memberRole.status === 'ok' && (
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Your role:{' '}
                <span className="normal-case tracking-normal text-zinc-800 dark:text-zinc-100">
                  {memberRole.role}
                </span>
              </p>
            )}
          </div>

          <OrganizationIdCopyRow organizationId={organizationId} className="max-w-md" />

          {canInvite && organizationId ? (
            <section className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/55">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Add member
              </h2>
              <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">
                User must already have an account. Assign PM or developer.
              </p>
              <form
                onSubmit={onInvite}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    autoComplete="email"
                  />
                </label>
                <label className="block w-full text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:w-40">
                  Role
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as 'PM' | 'DEVELOPER')
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="DEVELOPER">Developer</option>
                    <option value="PM">PM</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-300/70 bg-accent-500/10 px-4 py-2.5 text-sm font-semibold text-accent-900 shadow-sm transition hover:bg-accent-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-accent-600/35 dark:bg-accent-500/12 dark:text-accent-100"
                >
                  <Plus size={18} strokeWidth={2} aria-hidden />
                  Add
                </button>
              </form>
            </section>
          ) : null}

          {canManageProjects && organizationId ? (
            <section className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/55">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                New project
              </h2>
              <form
                onSubmit={onCreateProject}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <label className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Name
                  <input
                    type="text"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    maxLength={180}
                  />
                </label>
                <button
                  type="submit"
                  disabled={projectSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  <Plus size={18} strokeWidth={2} aria-hidden />
                  Create
                </button>
              </form>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Projects
            </h2>
            {projectsState.status === 'loading' ? (
              <div className="mt-4 space-y-2" aria-busy="true">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : projectsState.status === 'error' ? (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                {projectsState.message}
              </p>
            ) : projectsState.status !== 'ok' ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Loading workspace…
              </p>
            ) : projectsState.projects.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                No active projects. {canManageProjects ? 'Create one above.' : ''}
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {projectsState.projects.map((p) => {
                  const open = expandedProjectId === p.id;
                  return (
                    <li
                      key={p.id}
                      className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/55"
                    >
                      <div className="flex items-center gap-2 px-4 py-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() =>
                            setExpandedProjectId(open ? null : p.id)
                          }
                          aria-expanded={open}
                        >
                          {open ? (
                            <ChevronDown
                              size={18}
                              className="shrink-0 text-zinc-500"
                              aria-hidden
                            />
                          ) : (
                            <ChevronRight
                              size={18}
                              className="shrink-0 text-zinc-500"
                              aria-hidden
                            />
                          )}
                          <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                            {p.name}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                            {p.taskCount} task{p.taskCount === 1 ? '' : 's'}
                          </span>
                        </button>
                        {canManageProjects ? (
                          <button
                            type="button"
                            title="Archive project"
                            onClick={() => {
                              void archiveProject(p.id).catch(() => {
                                /* handled by user retry */
                              });
                            }}
                            className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                          >
                            <Trash2 size={16} strokeWidth={2} aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      {open ? (
                        <div className="border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
                          {p.description ? (
                            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
                              {p.description}
                            </p>
                          ) : null}
                          <div className="mt-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              Tasks
                            </h3>
                            {role === 'DEVELOPER' ? (
                              <p className="mt-1 text-[11px] text-zinc-500">
                                You can delete tasks you created; PM and admin
                                can remove any.
                              </p>
                            ) : null}
                            {tasksState.status === 'loading' ? (
                              <Skeleton className="mt-2 h-8 w-full" />
                            ) : tasksState.status === 'error' ? (
                              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                                {tasksState.message}
                              </p>
                            ) : tasksState.status !== 'ok' ? (
                              <p className="mt-2 text-[13px] text-zinc-500">
                                Loading tasks…
                              </p>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {tasksState.tasks.map((t) => (
                                  <li
                                    key={t.id}
                                    className="flex items-start justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-950/80"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                        {t.title}
                                      </p>
                                      <p className="text-[11px] text-zinc-500">
                                        {t.status} · {t.priority} · progress{' '}
                                        {t.progress}%
                                      </p>
                                    </div>
                                    {canDeleteThisTask(t) ? (
                                      <button
                                        type="button"
                                        title={
                                          role === 'DEVELOPER'
                                            ? 'Delete task (you created this)'
                                            : 'Delete task'
                                        }
                                        onClick={() => {
                                          void deleteTask(p.id, t.id);
                                        }}
                                        className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                                      >
                                        <Trash2
                                          size={14}
                                          strokeWidth={2}
                                          aria-hidden
                                        />
                                      </button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <form
                            className="mt-4 flex gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void createTask(p.id);
                            }}
                          >
                            <input
                              type="text"
                              placeholder="New task title"
                              value={taskTitleByProject[p.id] ?? ''}
                              onChange={(e) =>
                                setTaskTitleByProject((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                              maxLength={300}
                            />
                            <button
                              type="submit"
                              disabled={taskSubmitting}
                              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              Add
                            </button>
                          </form>
                          {organizationId ? (
                            <>
                              <ProjectSignalsPanel
                                organizationId={organizationId}
                                projectId={p.id}
                                canManage={canManageProjects}
                                refreshKey={dataBump}
                              />
                              <ProjectRiskPanel
                                organizationId={organizationId}
                                projectId={p.id}
                                canManage={canManageProjects}
                                refreshKey={dataBump}
                                onEvaluated={bumpData}
                              />
                              <ProjectGitHubPanel
                                organizationId={organizationId}
                                projectId={p.id}
                                canManage={canManageProjects}
                                refreshKey={dataBump}
                                onRefresh={bumpData}
                              />
                              <ProjectCliTokensPanel
                                organizationId={organizationId}
                                projectId={p.id}
                                refreshKey={dataBump}
                                memberRoleStatus={memberRole.status}
                                memberRoleError={
                                  memberRole.status === 'error'
                                    ? memberRole.message
                                    : undefined
                                }
                                role={cliPanelRole}
                                currentUserId={currentUserId}
                                onRefresh={bumpData}
                              />
                              <ProjectTerminalIncidentsPanel
                                organizationId={organizationId}
                                projectId={p.id}
                                refreshKey={dataBump}
                              />
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
