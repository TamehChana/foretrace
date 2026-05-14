import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import {
  parseCreateProjectEnvelope,
  useOrgProjects,
} from '../../hooks/use-org-projects';
import {
  memberLabel,
  useOrgMembers,
  type OrgMemberRow,
} from '../../hooks/use-org-members';
import {
  parseGithubLinkedUser,
  type OrgTaskGithubLinkedUser,
  type OrgTaskRow,
  useOrgTasks,
} from '../../hooks/use-org-tasks';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { useToast } from '../../providers/ToastProvider';
import { OrganizationIdCopyRow } from '../ui/OrganizationIdCopyRow';
import { UserIdCopyRow } from '../ui/UserIdCopyRow';
import { PageHeader } from '../ui/PageHeader';
import { ProjectCliTokensPanel } from './ProjectCliTokensPanel';
import { ProjectRiskPanel } from './ProjectRiskPanel';
import { ProjectTerminalIncidentsPanel } from './ProjectTerminalIncidentsPanel';
import { ProjectGithubSelfLinkCard } from './ProjectGithubSelfLinkCard';
import { ProjectGitHubPanel } from './ProjectGitHubPanel';
import { ProjectSignalsPanel } from './ProjectSignalsPanel';
import { Skeleton } from '../ui/Skeleton';

const TASK_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PROGRESS_OPTIONS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
];

const TASK_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

/** `yyyy-mm-dd` for `<input type="date" />` from API ISO deadline. */
function deadlineToDateInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** Date-only from picker → ISO string the API accepts. */
function dateInputToDeadlineIso(yyyyMmDd: string): string {
  const trimmed = yyyyMmDd.trim();
  if (!trimmed) {
    return '';
  }
  return `${trimmed}T12:00:00.000Z`;
}

function formatTaskDateTime(iso: string | null): string {
  if (!iso) {
    return '';
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

type TaskGithubActivityRow = {
  id: string;
  occurredAt: string;
  eventType: string;
  action: string | null;
  actorLogin: string | null;
  pullRequestNumber: number | null;
  summary: string;
  linkedUser: OrgTaskGithubLinkedUser | null;
};

function parseOneGithubActivityRow(row: unknown): TaskGithubActivityRow {
  if (!row || typeof row !== 'object' || !('id' in row)) {
    throw new Error('Invalid activity row');
  }
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    occurredAt: typeof r.occurredAt === 'string' ? r.occurredAt : '',
    eventType: typeof r.eventType === 'string' ? r.eventType : '',
    action:
      typeof r.action === 'string'
        ? r.action
        : r.action === null
          ? null
          : null,
    actorLogin:
      typeof r.actorLogin === 'string'
        ? r.actorLogin
        : r.actorLogin === null
          ? null
          : null,
    pullRequestNumber:
      typeof r.pullRequestNumber === 'number' ? r.pullRequestNumber : null,
    summary: typeof r.summary === 'string' ? r.summary : '',
    linkedUser: parseGithubLinkedUser(r.linkedUser),
  };
}

function parseGithubActivityEnvelope(json: unknown): TaskGithubActivityRow[] {
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new Error('Invalid response shape');
  }
  const raw = (json as { data: unknown }).data;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid response shape');
  }
  return raw.map(parseOneGithubActivityRow);
}

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
  const { projectsState, ingestCreatedProject } = useOrgProjects(
    organizationId,
    dataBump,
  );

  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );

  const tasksState = useOrgTasks(
    organizationId,
    expandedProjectId,
    dataBump,
  );
  const membersState = useOrgMembers(organizationId, dataBump);

  const [newProjectName, setNewProjectName] = useState('');
  const [projectSubmitting, setProjectSubmitting] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'PM' | 'DEVELOPER'>('DEVELOPER');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [taskTitleByProject, setTaskTitleByProject] = useState<
    Record<string, string>
  >({});
  /** Optional assignee user id when creating a task (per project). */
  const [taskAssignOnCreate, setTaskAssignOnCreate] = useState<
    Record<string, string>
  >({});
  const [taskPriorityOnCreate, setTaskPriorityOnCreate] = useState<
    Record<string, string>
  >({});
  const [taskDeadlineOnCreate, setTaskDeadlineOnCreate] = useState<
    Record<string, string>
  >({});
  const [taskGithubIssueOnCreate, setTaskGithubIssueOnCreate] = useState<
    Record<string, string>
  >({});
  const [taskGithubPrOnCreate, setTaskGithubPrOnCreate] = useState<
    Record<string, string>
  >({});
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [patchingTaskId, setPatchingTaskId] = useState<string | null>(null);
  const activityFetchedRef = useRef<Set<string>>(new Set());
  const [githubActivityByTask, setGithubActivityByTask] = useState<
    Record<
      string,
      | { status: 'idle' }
      | { status: 'loading' }
      | { status: 'ok'; rows: TaskGithubActivityRow[] }
      | { status: 'error'; message: string }
    >
  >({});
  const [githubCheckHintByTask, setGithubCheckHintByTask] = useState<
    Record<string, string>
  >({});
  const [myTasksOnlyByProject, setMyTasksOnlyByProject] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    activityFetchedRef.current = new Set();
    setGithubActivityByTask({});
    setGithubCheckHintByTask({});
  }, [organizationId, expandedProjectId]);

  const role = memberRole.status === 'ok' ? memberRole.role : null;
  const cliPanelRole =
    role === 'ADMIN' || role === 'PM' || role === 'DEVELOPER'
      ? (role as 'ADMIN' | 'PM' | 'DEVELOPER')
      : null;
  const canManageProjects = role === 'ADMIN' || role === 'PM';
  const canCreateTasks = role === 'ADMIN';
  const canReassignTasks = role === 'ADMIN' || role === 'PM';
  const canInvite = role === 'ADMIN' || role === 'PM';
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

  const canUpdateTaskExecution = useCallback(
    (task: OrgTaskRow): boolean => {
      if (!role || !currentUserId) {
        return false;
      }
      if (role === 'ADMIN' || role === 'PM') {
        return true;
      }
      if (role === 'DEVELOPER') {
        return (
          task.assigneeId === currentUserId ||
          (task.assigneeId === null && task.createdById === currentUserId)
        );
      }
      return false;
    },
    [role, currentUserId],
  );

  const loadGithubActivityForTask = useCallback(
    async (projectId: string, taskId: string) => {
      if (!organizationId) {
        return;
      }
      setGithubActivityByTask((prev) => ({
        ...prev,
        [taskId]: { status: 'loading' },
      }));
      try {
        const res = await apiFetch(
          `/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/github/activity`,
        );
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res));
        }
        const rows = parseGithubActivityEnvelope(await res.json());
        setGithubActivityByTask((prev) => ({
          ...prev,
          [taskId]: { status: 'ok', rows },
        }));
        bumpData();
      } catch (err: unknown) {
        setGithubActivityByTask((prev) => ({
          ...prev,
          [taskId]: {
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Failed to load activity',
          },
        }));
      }
    },
    [organizationId, bumpData],
  );

  const fetchGithubCheckStatusForTask = useCallback(
    async (projectId: string, taskId: string) => {
      if (!organizationId) {
        return;
      }
      setGithubCheckHintByTask((prev) => ({
        ...prev,
        [taskId]: 'Loading…',
      }));
      try {
        const res = await apiFetch(
          `/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/github/check-status`,
        );
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res));
        }
        const json: unknown = await res.json();
        if (!json || typeof json !== 'object' || !('data' in json)) {
          throw new Error('Invalid response shape');
        }
        const d = (json as { data: unknown }).data;
        if (!d || typeof d !== 'object' || !('ok' in d)) {
          throw new Error('Invalid response shape');
        }
        const data = d as
          | {
              ok: true;
              pullNumber: number;
              combinedStatus: string | null;
              headSha: string | null;
              note: string | null;
            }
          | { ok: false; reason: string };
        if (!data.ok) {
          const reason = data.reason;
          const msg =
            reason === 'no_github_connection'
              ? 'No GitHub connection on this project.'
              : reason === 'no_pull_request_number'
                ? 'No PR number yet. Set PR # on the task or trigger a webhook that references the issue.'
                : reason;
          setGithubCheckHintByTask((prev) => ({ ...prev, [taskId]: msg }));
          return;
        }
        const status = data.combinedStatus ?? 'unknown';
        const sha =
          typeof data.headSha === 'string' && data.headSha.length > 0
            ? data.headSha.slice(0, 7)
            : null;
        let suffix = '';
        if (data.note === 'pat_or_pr_unavailable') {
          suffix =
            ' (GitHub API unavailable: save a PAT on this project, or confirm FORETRACE_APP_SECRET decrypts it.)';
        } else if (data.note === 'pr_not_readable') {
          suffix =
            ' (Could not read that PR with the saved PAT — wrong PR #, fork-only PR, or token lacks repo scope.)';
        } else if (data.note === 'legacy_status_empty') {
          suffix =
            ' (PR head found; legacy /commits/…/status is empty — common for Checks-only repos; PAT may still be fine.)';
        }
        setGithubCheckHintByTask((prev) => ({
          ...prev,
          [taskId]: `PR #${data.pullNumber}: combined status ${status}${sha ? ` @ ${sha}` : ''}${suffix}`,
        }));
      } catch (err: unknown) {
        setGithubCheckHintByTask((prev) => ({
          ...prev,
          [taskId]:
            err instanceof Error ? err.message : 'Failed to load check status',
        }));
      }
    },
    [organizationId],
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
      const raw: unknown = await res.json().catch(() => null);
      const created = parseCreateProjectEnvelope(raw);
      if (created) {
        ingestCreatedProject(created);
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
      bumpData();
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
    const assignRaw = (taskAssignOnCreate[projectId] ?? '').trim();
    const body: {
      title: string;
      assigneeId?: string;
      priority?: string;
      deadline?: string;
      githubIssueNumber?: number;
      githubPullRequestNumber?: number;
    } = { title };
    if (canCreateTasks && assignRaw.length > 0) {
      body.assigneeId = assignRaw;
    }
    if (canCreateTasks) {
      const pr = (taskPriorityOnCreate[projectId] ?? '').trim();
      if (pr.length > 0) {
        body.priority = pr;
      }
      const dl = (taskDeadlineOnCreate[projectId] ?? '').trim();
      if (dl.length > 0) {
        body.deadline = dateInputToDeadlineIso(dl);
      }
      const issueRaw = (taskGithubIssueOnCreate[projectId] ?? '').trim();
      if (issueRaw.length > 0) {
        const n = parseInt(issueRaw, 10);
        if (Number.isFinite(n) && n > 0) {
          body.githubIssueNumber = n;
        }
      }
      const prRaw = (taskGithubPrOnCreate[projectId] ?? '').trim();
      if (prRaw.length > 0) {
        const n = parseInt(prRaw, 10);
        if (Number.isFinite(n) && n > 0) {
          body.githubPullRequestNumber = n;
        }
      }
    }
    setTaskSubmitting(true);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      setTaskTitleByProject((prev) => ({ ...prev, [projectId]: '' }));
      setTaskAssignOnCreate((prev) => ({ ...prev, [projectId]: '' }));
      setTaskPriorityOnCreate((prev) => ({ ...prev, [projectId]: '' }));
      setTaskDeadlineOnCreate((prev) => ({ ...prev, [projectId]: '' }));
      setTaskGithubIssueOnCreate((prev) => ({ ...prev, [projectId]: '' }));
      setTaskGithubPrOnCreate((prev) => ({ ...prev, [projectId]: '' }));
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

  const patchTaskAssignee = async (
    projectId: string,
    taskId: string,
    assigneeId: string | null,
  ) => {
    if (!organizationId) {
      return;
    }
    setPatchingTaskId(taskId);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeId }),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      bumpData();
      showToast(
        assigneeId ? 'Assignee updated' : 'Task unassigned',
        'success',
      );
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setPatchingTaskId(null);
    }
  };

  const patchTaskFields = async (
    projectId: string,
    taskId: string,
    body: Record<string, unknown>,
  ) => {
    if (!organizationId) {
      return;
    }
    setPatchingTaskId(taskId);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      bumpData();
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setPatchingTaskId(null);
    }
  };

  const reconcileGithubTaskProgress = async (
    projectId: string,
    taskId: string,
  ) => {
    if (!organizationId) {
      return;
    }
    setPatchingTaskId(taskId);
    try {
      const res = await apiFetch(
        `/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}/github/reconcile`,
        { method: 'POST' },
      );
      if (!res.ok) {
        showToast(await readApiErrorMessage(res), 'error');
        return;
      }
      const json = (await res.json()) as { data?: unknown };
      const d = json.data as
        | {
            ok: true;
            updated: boolean;
            note?:
              | null
              | 'already_in_sync'
              | 'github_pr_closed_without_merge'
              | 'github_state_open';
          }
        | { ok: false; reason: string }
        | undefined;
      if (!d) {
        showToast('Unexpected response', 'error');
        return;
      }
      if (!d.ok) {
        const messages: Record<string, string> = {
          no_github_connection: 'Link a GitHub repository to this project first.',
          missing_github_pat:
            'No GitHub PAT is stored for this project. Open Project → GitHub, paste a token, and Save PAT (or redeliver an issues/pull_request webhook from GitHub).',
          github_pat_decrypt_failed:
            'The PAT was saved with a different API secret than the server uses now. Set FORETRACE_APP_SECRET on the API to the same value used when you saved the token, or paste the PAT again under Project → GitHub and Save.',
          foretrace_app_secret_not_configured:
            'The API is missing FORETRACE_APP_SECRET (or it is under 16 characters). Set it on your API host, restart the API, then open Project → GitHub and Save PAT again.',
          github_not_found:
            'GitHub had no issue/PR with that number in this repo. Check Issue #.',
          github_forbidden: 'GitHub rejected the token (scope or access).',
          github_bad_response: 'Could not read issue state from GitHub.',
          no_github_issue_number: 'Set Issue # on this task before syncing.',
        };
        showToast(messages[d.reason] ?? d.reason, 'error');
        return;
      }
      bumpData();
      if (d.updated) {
        showToast('Task updated from GitHub', 'success');
      } else if (d.note === 'already_in_sync') {
        showToast('Already matches GitHub', 'success');
      } else if (d.note === 'github_pr_closed_without_merge') {
        showToast(
          'GitHub shows a closed PR that was not merged — progress was left unchanged.',
          'success',
        );
      } else if (d.note === 'github_state_open') {
        showToast('GitHub issue is open — set to in progress at 0%.', 'success');
      } else {
        showToast('Checked GitHub', 'success');
      }
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Request failed',
        'error',
      );
    } finally {
      setPatchingTaskId(null);
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
        description="Organization-scoped projects and tasks. Admins create tasks and can add PMs or developers; PMs and admins manage projects and archive them when done."
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

          <UserIdCopyRow userId={currentUserId} className="max-w-md" />

          {canInvite && organizationId ? (
            <section className="rounded-2xl border border-zinc-200/80 bg-white/95 p-5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/55">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Add member
              </h2>
              <p className="mt-1 text-[13px] text-zinc-600 dark:text-zinc-400">
                The person must already have signed up with this exact email
                address. You can make them a PM or a developer (not admin).
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
                autoComplete="off"
                onSubmit={onCreateProject}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <label
                  htmlFor="new-project-name"
                  className="block flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Project name
                  <input
                    id="new-project-name"
                    name="foretrace-project-name"
                    type="text"
                    required
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-bwignore
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
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                              <strong className="font-medium text-zinc-600 dark:text-zinc-400">
                                Admins
                              </strong>{' '}
                              create tasks.{' '}
                              <strong className="font-medium text-zinc-600 dark:text-zinc-400">
                                PMs and admins
                              </strong>{' '}
                              set assignees, link GitHub issue numbers, and manage
                              schedule and details.{' '}
                              <strong className="font-medium text-zinc-600 dark:text-zinc-400">
                                Assignees
                              </strong>{' '}
                              update status and progress on tasks assigned to them
                              (and on legacy unassigned tasks they originally
                              created). Deadlines feed{' '}
                              <strong className="font-medium text-zinc-600 dark:text-zinc-400">
                                Signals
                              </strong>
                              ; GitHub and CLI add activity when wired.
                            </p>
                            {membersState.status === 'error' ? (
                              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                Could not load members for assignment:{' '}
                                {membersState.message}
                              </p>
                            ) : null}
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
                              (() => {
                                const visibleTasks =
                                  myTasksOnlyByProject[p.id] && currentUserId
                                    ? tasksState.tasks.filter(
                                        (x) => x.assigneeId === currentUserId,
                                      )
                                    : tasksState.tasks;
                                return (
                                  <>
                                    {tasksState.tasks.length > 0 &&
                                    currentUserId ? (
                                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                                        <input
                                          type="checkbox"
                                          className="rounded border-zinc-300 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900"
                                          checked={
                                            myTasksOnlyByProject[p.id] ??
                                            false
                                          }
                                          onChange={(e) =>
                                            setMyTasksOnlyByProject(
                                              (prev) => ({
                                                ...prev,
                                                [p.id]: e.target.checked,
                                              }),
                                            )
                                          }
                                        />
                                        Show only tasks assigned to me
                                      </label>
                                    ) : null}
                                    {visibleTasks.length === 0 ? (
                                      <p className="mt-2 text-[12px] text-zinc-500">
                                        {tasksState.tasks.length === 0
                                          ? 'No tasks yet. Add one below.'
                                          : 'No tasks assigned to you. Clear the filter or ask a PM to assign work.'}
                                      </p>
                                    ) : (
                                      <ul className="mt-2 space-y-2">
                                        {visibleTasks.map((t) => {
                                          const membersList:
                                            | OrgMemberRow[]
                                            | null =
                                            membersState.status === 'ok'
                                              ? membersState.members
                                              : null;
                                          const assigneeLine = (() => {
                                            if (!t.assigneeId) {
                                              return 'Unassigned';
                                            }
                                            const m = membersList?.find(
                                              (x) => x.userId === t.assigneeId,
                                            );
                                            return m
                                              ? memberLabel(m)
                                              : 'Assigned (member list loading…)';
                                          })();
                                          const exec =
                                            canUpdateTaskExecution(t);
                                          const busy = patchingTaskId === t.id;
                                          return (
                                            <li
                                              key={t.id}
                                              className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-950/80"
                                            >
                                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div className="min-w-0 flex-1 space-y-1">
                                                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                                    {t.title}
                                                  </p>
                                                  {t.assigneeId &&
                                                  t.lastGithubLinkedUserId &&
                                                  t.assigneeId !==
                                                    t.lastGithubLinkedUserId ? (
                                                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                                                      Assignee (
                                                      {(() => {
                                                        const m =
                                                          membersList?.find(
                                                            (x) =>
                                                              x.userId ===
                                                              t.assigneeId,
                                                          );
                                                        return m
                                                          ? memberLabel(m)
                                                          : 'unknown member';
                                                      })()}
                                                      ) does not match the
                                                      Foretrace user linked from
                                                      the last GitHub webhook (
                                                      {(() => {
                                                        const gh =
                                                          t.lastGithubLinkedUser;
                                                        const who =
                                                          gh &&
                                                          (gh.displayName?.trim() ||
                                                            gh.email?.trim() ||
                                                            null);
                                                        return who ?? 'unknown';
                                                      })()}
                                                      ). Confirm who is actively
                                                      working this task.
                                                    </p>
                                                  ) : null}
                                                  {(() => {
                                                    const repoRaw =
                                                      p.githubRepositoryFullName;
                                                    const repo =
                                                      typeof repoRaw === 'string'
                                                        ? repoRaw.trim()
                                                        : '';
                                                    const issueUrl =
                                                      repo.length > 0 &&
                                                      t.githubIssueNumber != null
                                                        ? `https://github.com/${repo}/issues/${t.githubIssueNumber}`
                                                        : null;
                                                    const prUrl =
                                                      repo.length > 0 &&
                                                      t.lastGithubPullRequestNumber !=
                                                        null
                                                        ? `https://github.com/${repo}/pull/${t.lastGithubPullRequestNumber}`
                                                        : null;
                                                    if (
                                                      !issueUrl &&
                                                      t.githubIssueNumber ==
                                                        null &&
                                                      !prUrl &&
                                                      t.lastGithubPullRequestNumber ==
                                                        null &&
                                                      !t.lastGithubActivityAt
                                                    ) {
                                                      return null;
                                                    }
                                                    return (
                                                      <div className="space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                                                        {t.githubIssueNumber !=
                                                        null ? (
                                                          issueUrl ? (
                                                            <a
                                                              href={issueUrl}
                                                              target="_blank"
                                                              rel="noreferrer"
                                                              className="font-medium text-accent-700 hover:underline dark:text-accent-400"
                                                            >
                                                              GitHub issue #
                                                              {t.githubIssueNumber}
                                                            </a>
                                                          ) : (
                                                            <span>
                                                              Issue #
                                                              {t.githubIssueNumber}
                                                            </span>
                                                          )
                                                        ) : null}
                                                        {t.lastGithubPullRequestNumber !=
                                                        null ? (
                                                          prUrl ? (
                                                            <p>
                                                              <a
                                                                href={prUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="font-medium text-accent-700 hover:underline dark:text-accent-400"
                                                              >
                                                                Linked PR #
                                                                {
                                                                  t.lastGithubPullRequestNumber
                                                                }
                                                              </a>
                                                            </p>
                                                          ) : (
                                                            <p>
                                                              Linked PR #
                                                              {
                                                                t.lastGithubPullRequestNumber
                                                              }
                                                            </p>
                                                          )
                                                        ) : null}
                                                        {t.lastGithubActivityAt ? (
                                                          <p className="text-zinc-500">
                                                            Last GitHub activity:{' '}
                                                            {formatTaskDateTime(
                                                              t.lastGithubActivityAt,
                                                            )}
                                                            {(() => {
                                                              const gh =
                                                                t.lastGithubLinkedUser;
                                                              const who =
                                                                gh &&
                                                                (gh.displayName
                                                                  ?.trim() ||
                                                                  gh.email
                                                                    ?.trim() ||
                                                                  null);
                                                              if (who) {
                                                                return ` (${who})`;
                                                              }
                                                              return t.lastGithubActorLogin
                                                                ? ` (@${t.lastGithubActorLogin})`
                                                                : '';
                                                            })()}
                                                          </p>
                                                        ) : null}
                                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                                          <button
                                                            type="button"
                                                            className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                                            onClick={() => {
                                                              void fetchGithubCheckStatusForTask(
                                                                p.id,
                                                                t.id,
                                                              );
                                                            }}
                                                          >
                                                            PR combined status
                                                          </button>
                                                          {githubCheckHintByTask[
                                                            t.id
                                                          ] ? (
                                                            <span className="max-w-[min(100%,28rem)] text-[10px] text-zinc-500">
                                                              {
                                                                githubCheckHintByTask[
                                                                  t.id
                                                                ]
                                                              }
                                                            </span>
                                                          ) : null}
                                                        </div>
                                                        <details
                                                          className="pt-1"
                                                          onToggle={(ev) => {
                                                            const el =
                                                              ev.currentTarget;
                                                            if (!el.open) {
                                                              return;
                                                            }
                                                            if (
                                                              activityFetchedRef.current.has(
                                                                t.id,
                                                              )
                                                            ) {
                                                              return;
                                                            }
                                                            activityFetchedRef.current.add(
                                                              t.id,
                                                            );
                                                            void loadGithubActivityForTask(
                                                              p.id,
                                                              t.id,
                                                            );
                                                          }}
                                                        >
                                                          <summary className="cursor-pointer text-[10px] font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                                                            Webhook delivery log
                                                          </summary>
                                                          <div className="mt-1 space-y-1 border-l border-zinc-200 pl-2 dark:border-zinc-700">
                                                            {(() => {
                                                              const st =
                                                                githubActivityByTask[
                                                                  t.id
                                                                ];
                                                              if (!st) {
                                                                return (
                                                                  <p className="text-[10px] text-zinc-500">
                                                                    Open to load
                                                                    recent
                                                                    GitHub events
                                                                    for this task.
                                                                  </p>
                                                                );
                                                              }
                                                              if (
                                                                st.status ===
                                                                'loading'
                                                              ) {
                                                                return (
                                                                  <p className="text-[10px] text-zinc-500">
                                                                    Loading…
                                                                  </p>
                                                                );
                                                              }
                                                              if (
                                                                st.status ===
                                                                'error'
                                                              ) {
                                                                return (
                                                                  <p className="text-[10px] text-rose-600">
                                                                    {st.message}
                                                                  </p>
                                                                );
                                                              }
                                                              if (st.status !== 'ok') {
                                                                return null;
                                                              }
                                                              const { rows } = st;
                                                              if (rows.length === 0) {
                                                                return (
                                                                  <p className="text-[10px] text-zinc-500">
                                                                    No stored
                                                                    deliveries yet.
                                                                  </p>
                                                                );
                                                              }
                                                              return rows.map(
                                                                (row: TaskGithubActivityRow) => (
                                                                  <div
                                                                    key={row.id}
                                                                    className="text-[10px] text-zinc-600 dark:text-zinc-400"
                                                                  >
                                                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                                                      {formatTaskDateTime(
                                                                        row.occurredAt,
                                                                      )}
                                                                    </span>
                                                                    {': '}
                                                                    {row.eventType}
                                                                    {row.action
                                                                      ? ` / ${row.action}`
                                                                      : ''}
                                                                    {row.pullRequestNumber !=
                                                                    null
                                                                      ? ` · PR #${row.pullRequestNumber}`
                                                                      : ''}
                                                                    {row.actorLogin
                                                                      ? ` · @${row.actorLogin}`
                                                                      : ''}
                                                                    <div className="text-zinc-500">
                                                                      {row.summary}
                                                                    </div>
                                                                  </div>
                                                                ),
                                                              );
                                                            })()}
                                                          </div>
                                                        </details>
                                                        <p className="text-[10px] leading-snug text-zinc-400 dark:text-zinc-500">
                                                          Activity comes from repo
                                                          webhooks that reference this
                                                          issue #. The name is who
                                                          GitHub reported for that
                                                          event — not proof it was the
                                                          Foretrace assignee.
                                                        </p>
                                                      </div>
                                                    );
                                                  })()}
                                                  {!canReassignTasks ? (
                                                    <p className="text-[11px] text-zinc-500">
                                                      {t.priority}
                                                      {t.deadline
                                                        ? ` · due ${new Date(t.deadline).toLocaleDateString()}`
                                                        : ''}
                                                    </p>
                                                  ) : null}
                                                  {!canReassignTasks ? (
                                                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                                                      <span className="font-medium text-zinc-500">
                                                        Assignee:
                                                      </span>{' '}
                                                      {assigneeLine}
                                                    </p>
                                                  ) : null}
                                                </div>
                                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:justify-end">
                                                  <div className="flex flex-wrap items-end gap-2">
                                                    <div className="flex min-w-[7.5rem] flex-col gap-0.5">
                                                      <label
                                                        htmlFor={`status-${p.id}-${t.id}`}
                                                        className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                                      >
                                                        Status
                                                      </label>
                                                      <select
                                                        id={`status-${p.id}-${t.id}`}
                                                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                        value={t.status}
                                                        disabled={!exec || busy}
                                                        onChange={(e) => {
                                                          void patchTaskFields(
                                                            p.id,
                                                            t.id,
                                                            {
                                                              status:
                                                                e.target.value,
                                                            },
                                                          );
                                                        }}
                                                      >
                                                        {TASK_STATUS_OPTIONS.map(
                                                          (opt) => (
                                                            <option
                                                              key={opt.value}
                                                              value={opt.value}
                                                            >
                                                              {opt.label}
                                                            </option>
                                                          ),
                                                        )}
                                                      </select>
                                                    </div>
                                                    <div className="flex min-w-[6rem] flex-col gap-0.5">
                                                      <label
                                                        htmlFor={`prog-${p.id}-${t.id}`}
                                                        className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                                      >
                                                        Progress
                                                      </label>
                                                      <select
                                                        id={`prog-${p.id}-${t.id}`}
                                                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                        value={t.progress}
                                                        disabled={!exec || busy}
                                                        onChange={(e) => {
                                                          void patchTaskFields(
                                                            p.id,
                                                            t.id,
                                                            {
                                                              progress: Number(
                                                                e.target.value,
                                                              ),
                                                            },
                                                          );
                                                        }}
                                                      >
                                                        {PROGRESS_OPTIONS.map(
                                                          (n) => (
                                                            <option
                                                              key={n}
                                                              value={n}
                                                            >
                                                              {n}%
                                                            </option>
                                                          ),
                                                        )}
                                                      </select>
                                                    </div>
                                                    {exec &&
                                                    t.status !== 'DONE' &&
                                                    t.status !== 'CANCELLED' ? (
                                                      <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => {
                                                          void patchTaskFields(
                                                            p.id,
                                                            t.id,
                                                            {
                                                              status: 'DONE',
                                                              progress: 100,
                                                            },
                                                          );
                                                        }}
                                                        className="self-end rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-900/80"
                                                      >
                                                        Mark done
                                                      </button>
                                                    ) : null}
                                                  </div>
                                                  {canReassignTasks ? (
                                                    <div className="flex w-full flex-col gap-2 sm:max-w-md">
                                                      <div className="flex w-full min-w-[12rem] flex-col gap-0.5 sm:w-56">
                                                        <label
                                                          htmlFor={`assign-${p.id}-${t.id}`}
                                                          className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                                        >
                                                          Assign to
                                                        </label>
                                                        <select
                                                          id={`assign-${p.id}-${t.id}`}
                                                          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                          value={
                                                            t.assigneeId ?? ''
                                                          }
                                                          disabled={
                                                            busy ||
                                                            membersState.status !==
                                                              'ok'
                                                          }
                                                          onChange={(e) => {
                                                            const v =
                                                              e.target.value.trim();
                                                            const next =
                                                              v.length > 0
                                                                ? v
                                                                : null;
                                                            const prev =
                                                              t.assigneeId ??
                                                              null;
                                                            if (next === prev) {
                                                              return;
                                                            }
                                                            void patchTaskAssignee(
                                                              p.id,
                                                              t.id,
                                                              next,
                                                            );
                                                          }}
                                                        >
                                                          <option value="">
                                                            Unassigned
                                                          </option>
                                                          {membersState.status ===
                                                            'ok' &&
                                                            membersState.members.map(
                                                              (m) => (
                                                                <option
                                                                  key={m.userId}
                                                                  value={
                                                                    m.userId
                                                                  }
                                                                >
                                                                  {memberLabel(
                                                                    m,
                                                                  )}
                                                                </option>
                                                              ),
                                                            )}
                                                        </select>
                                                      </div>
                                                      <div className="flex flex-wrap items-end gap-2">
                                                        <div className="flex min-w-[7.5rem] flex-col gap-0.5">
                                                          <label
                                                            htmlFor={`pri-${p.id}-${t.id}`}
                                                            className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                                          >
                                                            Priority
                                                          </label>
                                                          <select
                                                            id={`pri-${p.id}-${t.id}`}
                                                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 shadow-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                            value={t.priority}
                                                            disabled={busy}
                                                            onChange={(e) => {
                                                              void patchTaskFields(
                                                                p.id,
                                                                t.id,
                                                                {
                                                                  priority:
                                                                    e.target
                                                                      .value,
                                                                },
                                                              );
                                                            }}
                                                          >
                                                            {TASK_PRIORITY_OPTIONS.map(
                                                              (opt) => (
                                                                <option
                                                                  key={
                                                                    opt.value
                                                                  }
                                                                  value={
                                                                    opt.value
                                                                  }
                                                                >
                                                                  {opt.label}
                                                                </option>
                                                              ),
                                                            )}
                                                          </select>
                                                        </div>
                                                        <div className="flex min-w-[10rem] flex-col gap-0.5">
                                                          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                                            Due date
                                                          </span>
                                                          <div className="flex flex-wrap items-center gap-1.5">
                                                            <input
                                                              type="date"
                                                              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                              value={deadlineToDateInput(
                                                                t.deadline,
                                                              )}
                                                              disabled={busy}
                                                              onChange={(e) => {
                                                                const v =
                                                                  e.target.value;
                                                                void patchTaskFields(
                                                                  p.id,
                                                                  t.id,
                                                                  {
                                                                    deadline:
                                                                      v.length >
                                                                      0
                                                                        ? dateInputToDeadlineIso(
                                                                            v,
                                                                          )
                                                                        : null,
                                                                  },
                                                                );
                                                              }}
                                                            />
                                                            {t.deadline ? (
                                                              <button
                                                                type="button"
                                                                disabled={
                                                                  busy
                                                                }
                                                                onClick={() => {
                                                                  void patchTaskFields(
                                                                    p.id,
                                                                    t.id,
                                                                    {
                                                                      deadline:
                                                                        null,
                                                                    },
                                                                  );
                                                                }}
                                                                className="text-[10px] font-semibold text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                                                              >
                                                                Clear
                                                              </button>
                                                            ) : null}
                                                          </div>
                                                        </div>
                                                        <div className="flex min-w-[7rem] flex-col gap-0.5">
                                                          <label
                                                            htmlFor={`gh-issue-${p.id}-${t.id}`}
                                                            className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                                          >
                                                            Issue #
                                                          </label>
                                                          <input
                                                            id={`gh-issue-${p.id}-${t.id}`}
                                                            type="number"
                                                            min={1}
                                                            disabled={busy}
                                                            defaultValue={
                                                              t.githubIssueNumber ??
                                                              undefined
                                                            }
                                                            key={`gh-${t.id}-${t.githubIssueNumber ?? 'none'}`}
                                                            onBlur={(e) => {
                                                              const raw =
                                                                e.target.value.trim();
                                                              const prev =
                                                                t.githubIssueNumber;
                                                              if (raw === '') {
                                                                if (
                                                                  prev != null
                                                                ) {
                                                                  void patchTaskFields(
                                                                    p.id,
                                                                    t.id,
                                                                    {
                                                                      githubIssueNumber:
                                                                        null,
                                                                    },
                                                                  );
                                                                }
                                                                return;
                                                              }
                                                              const n = parseInt(
                                                                raw,
                                                                10,
                                                              );
                                                              if (
                                                                !Number.isFinite(
                                                                  n,
                                                                ) ||
                                                                n < 1
                                                              ) {
                                                                return;
                                                              }
                                                              if (n === prev) {
                                                                return;
                                                              }
                                                              void patchTaskFields(
                                                                p.id,
                                                                t.id,
                                                                {
                                                                  githubIssueNumber:
                                                                    n,
                                                                },
                                                              );
                                                            }}
                                                            className="w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                          />
                                                          {exec &&
                                                          t.githubIssueNumber !=
                                                            null ? (
                                                            <button
                                                              type="button"
                                                              disabled={busy}
                                                              onClick={() => {
                                                                void reconcileGithubTaskProgress(
                                                                  p.id,
                                                                  t.id,
                                                                );
                                                              }}
                                                              className="mt-1 text-left text-[10px] font-semibold text-accent-700 underline hover:text-accent-900 disabled:opacity-50 dark:text-accent-400 dark:hover:text-accent-300"
                                                            >
                                                              Sync progress from
                                                              GitHub
                                                            </button>
                                                          ) : null}
                                                        </div>
                                                        <div className="flex min-w-[7rem] flex-col gap-0.5">
                                                          <label
                                                            htmlFor={`gh-pr-${p.id}-${t.id}`}
                                                            className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                                          >
                                                            PR #
                                                          </label>
                                                          <input
                                                            id={`gh-pr-${p.id}-${t.id}`}
                                                            type="number"
                                                            min={1}
                                                            disabled={busy}
                                                            defaultValue={
                                                              t.lastGithubPullRequestNumber ??
                                                              undefined
                                                            }
                                                            key={`gh-pr-${t.id}-${t.lastGithubPullRequestNumber ?? 'none'}`}
                                                            onBlur={(e) => {
                                                              const raw =
                                                                e.target.value.trim();
                                                              const prev =
                                                                t.lastGithubPullRequestNumber;
                                                              if (raw === '') {
                                                                if (
                                                                  prev != null
                                                                ) {
                                                                  void patchTaskFields(
                                                                    p.id,
                                                                    t.id,
                                                                    {
                                                                      githubPullRequestNumber:
                                                                        null,
                                                                    },
                                                                  );
                                                                }
                                                                return;
                                                              }
                                                              const n = parseInt(
                                                                raw,
                                                                10,
                                                              );
                                                              if (
                                                                !Number.isFinite(
                                                                  n,
                                                                ) ||
                                                                n < 1
                                                              ) {
                                                                return;
                                                              }
                                                              if (n === prev) {
                                                                return;
                                                              }
                                                              void patchTaskFields(
                                                                p.id,
                                                                t.id,
                                                                {
                                                                  githubPullRequestNumber:
                                                                    n,
                                                                },
                                                              );
                                                            }}
                                                            className="w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                                          />
                                                        </div>
                                                      </div>
                                                    </div>
                                                  ) : null}
                                                  {canDeleteThisTask(t) ? (
                                                    <button
                                                      type="button"
                                                      title={
                                                        role === 'DEVELOPER'
                                                          ? 'Delete task (you created this)'
                                                          : 'Delete task'
                                                      }
                                                      onClick={() => {
                                                        void deleteTask(
                                                          p.id,
                                                          t.id,
                                                        );
                                                      }}
                                                      className="self-end rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                                                    >
                                                      <Trash2
                                                        size={14}
                                                        strokeWidth={2}
                                                        aria-hidden
                                                      />
                                                    </button>
                                                  ) : null}
                                                </div>
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </>
                                );
                              })()
                            )}
                          </div>
                          {canCreateTasks ? (
                            <form
                              autoComplete="off"
                              className="mt-4 flex flex-col gap-3"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void createTask(p.id);
                              }}
                            >
                              <div className="flex gap-2">
                                <input
                                  name={`foretrace-task-title-${p.id}`}
                                  type="text"
                                  placeholder="New task title"
                                  value={taskTitleByProject[p.id] ?? ''}
                                  onChange={(e) =>
                                    setTaskTitleByProject((prev) => ({
                                      ...prev,
                                      [p.id]: e.target.value,
                                    }))
                                  }
                                  autoComplete="off"
                                  data-1p-ignore
                                  data-lpignore="true"
                                  data-bwignore
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
                              </div>
                              <div className="flex max-w-md flex-col gap-1">
                                <label
                                  htmlFor={`new-task-assign-${p.id}`}
                                  className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                >
                                  Assign when created (optional)
                                </label>
                                <select
                                  id={`new-task-assign-${p.id}`}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                  value={taskAssignOnCreate[p.id] ?? ''}
                                  disabled={
                                    taskSubmitting ||
                                    membersState.status !== 'ok'
                                  }
                                  onChange={(e) =>
                                    setTaskAssignOnCreate((prev) => ({
                                      ...prev,
                                      [p.id]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">No assignee</option>
                                  {membersState.status === 'ok' &&
                                    membersState.members.map((m) => (
                                      <option
                                        key={m.userId}
                                        value={m.userId}
                                      >
                                        {memberLabel(m)}
                                      </option>
                                    ))}
                                </select>
                              </div>
                              <>
                                <div className="grid max-w-lg gap-3 sm:grid-cols-2">
                                  <div className="flex flex-col gap-1">
                                    <label
                                      htmlFor={`new-task-pri-${p.id}`}
                                      className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                    >
                                      Priority (optional)
                                    </label>
                                    <select
                                      id={`new-task-pri-${p.id}`}
                                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                      value={taskPriorityOnCreate[p.id] ?? ''}
                                      disabled={taskSubmitting}
                                      onChange={(e) =>
                                        setTaskPriorityOnCreate((prev) => ({
                                          ...prev,
                                          [p.id]: e.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">
                                        Default (medium)
                                      </option>
                                      {TASK_PRIORITY_OPTIONS.map((opt) => (
                                        <option
                                          key={opt.value}
                                          value={opt.value}
                                        >
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label
                                      htmlFor={`new-task-dl-${p.id}`}
                                      className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                    >
                                      Due date (optional)
                                    </label>
                                    <input
                                      id={`new-task-dl-${p.id}`}
                                      type="date"
                                      disabled={taskSubmitting}
                                      value={taskDeadlineOnCreate[p.id] ?? ''}
                                      onChange={(e) =>
                                        setTaskDeadlineOnCreate((prev) => ({
                                          ...prev,
                                          [p.id]: e.target.value,
                                        }))
                                      }
                                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                    />
                                  </div>
                                </div>
                                <div className="mt-2 grid max-w-lg gap-3 sm:grid-cols-2">
                                  <div className="flex flex-col gap-1">
                                    <label
                                      htmlFor={`new-task-gh-${p.id}`}
                                      className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                    >
                                      GitHub issue # (optional)
                                    </label>
                                    <input
                                      id={`new-task-gh-${p.id}`}
                                      type="number"
                                      min={1}
                                      disabled={taskSubmitting}
                                      value={taskGithubIssueOnCreate[p.id] ?? ''}
                                      onChange={(e) =>
                                        setTaskGithubIssueOnCreate((prev) => ({
                                          ...prev,
                                          [p.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="e.g. 42"
                                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label
                                      htmlFor={`new-task-gh-pr-${p.id}`}
                                      className="text-[10px] font-medium uppercase tracking-wide text-zinc-500"
                                    >
                                      GitHub PR # (optional)
                                    </label>
                                    <input
                                      id={`new-task-gh-pr-${p.id}`}
                                      type="number"
                                      min={1}
                                      disabled={taskSubmitting}
                                      value={taskGithubPrOnCreate[p.id] ?? ''}
                                      onChange={(e) =>
                                        setTaskGithubPrOnCreate((prev) => ({
                                          ...prev,
                                          [p.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="e.g. 7"
                                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                    />
                                  </div>
                                </div>
                              </>
                            </form>
                          ) : (
                            <p className="mt-4 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                              Only an organization admin can add tasks to this
                              project. Ask an admin to create work; PMs can still
                              assign people and edit details on existing tasks.
                              Your assigned work appears in the list above.
                            </p>
                          )}
                          {organizationId ? (
                            <>
                              {canManageProjects ? (
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
                                    currentUserId={currentUserId}
                                    refreshKey={dataBump}
                                    onRefresh={bumpData}
                                  />
                                  <ProjectTerminalIncidentsPanel
                                    organizationId={organizationId}
                                    projectId={p.id}
                                    refreshKey={dataBump}
                                  />
                                </>
                              ) : (
                                <>
                                  <div className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/50">
                                    <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                                      <strong className="font-medium text-zinc-800 dark:text-zinc-200">
                                        Limited project view.
                                      </strong>{' '}
                                      Signals, delivery risk, GitHub connection
                                      settings, and organization-wide terminal
                                      incidents are visible to PMs and admins only.
                                      Tasks assigned to you, and unassigned tasks you
                                      created before this policy, are listed above.
                                      Ask an admin to add new tasks. Use CLI
                                      tokens below for your own terminal ingest.
                                    </p>
                                  </div>
                                  {organizationId ? (
                                    <ProjectGithubSelfLinkCard
                                      organizationId={organizationId}
                                      projectId={p.id}
                                      currentUserId={currentUserId}
                                      refreshKey={dataBump}
                                      onRefresh={bumpData}
                                    />
                                  ) : null}
                                </>
                              )}
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
