import type { ReactNode } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../ui/PageHeader';

const STEPS = [
  { id: 'step-1', label: '1 · Account' },
  { id: 'step-2', label: '2 · Organization' },
  { id: 'step-3', label: '3 · Project' },
  { id: 'step-4', label: '4 · Tasks' },
  { id: 'step-5', label: '5 · GitHub (optional)' },
  { id: 'step-6', label: '6 · Terminal (optional)' },
  { id: 'step-7', label: '7 · Signals & risk' },
  { id: 'step-8', label: '8 · Alerts' },
  { id: 'step-9', label: '9 · Settings' },
  { id: 'step-10', label: '10 · Keep going' },
] as const;

function WorkflowStep({
  step,
  id,
  title,
  children,
}: {
  step: number;
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-zinc-100 pt-10 first:border-t-0 first:pt-0 dark:border-zinc-800/80"
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-sm font-bold text-accent-900 ring-1 ring-accent-400/25 dark:text-accent-100 dark:ring-accent-500/35"
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[12px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  );
}

export function DocumentationPage() {
  return (
    <main className="pb-16">
      <PageHeader
        eyebrow="Help"
        title="Step-by-step workflow"
        description={
          <>
            Walk through Foretrace from <strong className="font-medium text-zinc-800 dark:text-zinc-200">first sign-up</strong> to{' '}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">ongoing delivery monitoring</strong>. Follow the steps in order; treat GitHub and
            terminal ingest as optional branches until you need them.
          </>
        }
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

      <nav
        aria-label="Workflow steps"
        className="mb-10 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <BookOpen size={14} strokeWidth={2} aria-hidden />
          Jump to a step
        </p>
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[13px] font-medium">
          {STEPS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent-700 hover:underline dark:text-accent-400">
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="max-w-3xl">
        <WorkflowStep step={1} id="step-1" title="Create your account and stay signed in">
          <p>
            Open the app and choose <strong className="font-medium text-zinc-800 dark:text-zinc-200">Sign in</strong> in the header. Register with your email
            and a password, or log in if you already have an account. Foretrace keeps a session in this browser so you can refresh without signing in again.
          </p>
          <p>
            On a shared computer, use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Sign out</strong> when you leave. You need to be signed in for everything below except reading this page.
          </p>
        </WorkflowStep>

        <WorkflowStep step={2} id="step-2" title="Create or choose an organization">
          <p>
            All projects and data live inside an <strong className="font-medium text-zinc-800 dark:text-zinc-200">organization</strong> (your team workspace). From the{' '}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Overview</strong>, create a new organization or select one you belong to.
          </p>
          <p>
            The app remembers the active org in the URL as <Code>?org=&lt;organization-id&gt;</Code>. If you belong to several orgs, use the organization selector on{' '}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Projects</strong>, <strong className="font-medium text-zinc-800 dark:text-zinc-200">Alerts</strong>, or{' '}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Settings</strong> before continuing—each step below uses whichever org is selected.
          </p>
        </WorkflowStep>

        <WorkflowStep step={3} id="step-3" title="Create your first project">
          <p>
            Go to <strong className="font-medium text-zinc-800 dark:text-zinc-200">Projects</strong> in the sidebar. With the right organization selected, create a project with a clear name (for example the product or initiative you are tracking).
          </p>
          <p>
            Expand the project row when you need to work inside it: tasks, GitHub, CLI tokens, signals, risk, and terminal incidents all live under that expanded view.
          </p>
        </WorkflowStep>

        <WorkflowStep step={4} id="step-4" title="Add tasks so delivery work is visible">
          <p>
            Inside the expanded project, add <strong className="font-medium text-zinc-800 dark:text-zinc-200">tasks</strong> for real work items—titles, status, due dates as your team uses them. Foretrace uses active, overdue, and due-soon tasks when it builds the signal snapshot and risk score.
          </p>
          <p>
            Archive or clean up tasks when work finishes so the picture stays accurate. You can invite members to the org (from Projects, depending on your role) so others can edit tasks and run evaluations too.
          </p>
        </WorkflowStep>

        <WorkflowStep step={5} id="step-5" title="Optional: connect GitHub to the project">
          <p>
            If your team uses GitHub, an <strong className="font-medium text-zinc-800 dark:text-zinc-200">admin or PM</strong> can open the <strong className="font-medium text-zinc-800 dark:text-zinc-200">GitHub</strong> section for the project, enter <Code>owner/repo</Code>, and connect. Copy the one-time <strong className="font-medium text-zinc-800 dark:text-zinc-200">webhook secret</strong> and the webhook URL, then in GitHub add a repository webhook with JSON payloads and that secret so deliveries reach Foretrace.
          </p>
          <p>
            Optionally add a <strong className="font-medium text-zinc-800 dark:text-zinc-200">personal access token</strong> if your policy allows REST enrichment (open PR/issue counts, branch status). Map GitHub usernames to Foretrace users when you want people-level alignment in the UI.
          </p>
          <p>
            Skip this entire step if you are not ready to wire GitHub yet—you can add it later and the rest of the workflow still works.
          </p>
        </WorkflowStep>

        <WorkflowStep step={6} id="step-6" title="Optional: stream terminal output with the CLI">
          <p>
            To capture build or script failures automatically, a <strong className="font-medium text-zinc-800 dark:text-zinc-200">PM, admin, or developer</strong> mints a <strong className="font-medium text-zinc-800 dark:text-zinc-200">CLI ingest token</strong> in the project panel. The plaintext token is shown once; store it in a password manager or CI secret.
          </p>
          <p>
            On the machine or runner that will send logs, set:
          </p>
          <ul className="list-inside list-disc space-y-1 pl-1">
            <li>
              <Code>FORETRACE_API_URL</Code> — API base URL with no trailing slash.
            </li>
            <li>
              <Code>FORETRACE_TOKEN</Code> — the <Code>ft_ck_…</Code> value from the dashboard.
            </li>
            <li>
              <Code>FORETRACE_ORGANIZATION_ID</Code> and <Code>FORETRACE_PROJECT_ID</Code> — copy from the app URL or UI.
            </li>
            <li>
              Optional: <Code>FORETRACE_TASK_ID</Code> to tie output to a task.
            </li>
          </ul>
          <p>
            Install or build the Foretrace CLI, then pipe command output to ingest (for example <Code>npm run build 2&gt;&amp;1 | npm run terminal:ingest</Code> from the repo root) or use <Code>foretrace run -- &lt;command&gt;</Code>. Successful batches show up under <strong className="font-medium text-zinc-800 dark:text-zinc-200">Terminal incidents</strong> after classification.
          </p>
        </WorkflowStep>

        <WorkflowStep step={7} id="step-7" title="Review signals, then evaluate delivery risk">
          <p>
            Open the <strong className="font-medium text-zinc-800 dark:text-zinc-200">Signals</strong> panel for the project. You should see a time-window rollup: GitHub activity (if connected), terminal activity (if any), and task pressure. If the snapshot looks stale, click <strong className="font-medium text-zinc-800 dark:text-zinc-200">Refresh</strong> (PM/admin) to recompute.
          </p>
          <p>
            When you are ready for a scored readout, click <strong className="font-medium text-zinc-800 dark:text-zinc-200">Evaluate</strong> under <strong className="font-medium text-zinc-800 dark:text-zinc-200">Delivery risk</strong>. That refreshes signals, runs the rule engine, saves a history row, and updates the latest risk level and reasons. Past runs appear in <strong className="font-medium text-zinc-800 dark:text-zinc-200">Evaluation history</strong>; an optional short narrative may appear if your deployment enables it.
          </p>
          <p>
            Repeat this step whenever you want a fresh score—for example after a busy day of merges or before a release review.
          </p>
        </WorkflowStep>

        <WorkflowStep step={8} id="step-8" title="Watch the Alerts inbox">
          <p>
            When risk crosses thresholds your deployment cares about (for example first time at medium or higher, or a worsening trend), Foretrace can raise <strong className="font-medium text-zinc-800 dark:text-zinc-200">alerts</strong> for the organization.
          </p>
          <p>
            Open <strong className="font-medium text-zinc-800 dark:text-zinc-200">Alerts</strong> in the sidebar. Filter unread items, open an alert to see context, <strong className="font-medium text-zinc-800 dark:text-zinc-200">mark read</strong> when you have handled it, and use the link back to <strong className="font-medium text-zinc-800 dark:text-zinc-200">Projects</strong> to dig into the underlying project.
          </p>
        </WorkflowStep>

        <WorkflowStep step={9} id="step-9" title="Review actions in Settings (audit log)">
          <p>
            Open <strong className="font-medium text-zinc-800 dark:text-zinc-200">Settings</strong> for a read-only <strong className="font-medium text-zinc-800 dark:text-zinc-200">audit log</strong> of recent actions in the selected organization—who changed what and when. Use it for oversight after invites, GitHub changes, token mints, or risk evaluations.
          </p>
        </WorkflowStep>

        <WorkflowStep step={10} id="step-10" title="Your ongoing loop—and troubleshooting">
          <p>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Day to day:</strong> keep tasks current, let webhooks and CLI feed signals, refresh or evaluate when you need a fresh picture, triage alerts, and spot-check the audit log after sensitive changes.
          </p>
          <p>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">If the UI cannot reach the API</strong> (blank health, CORS errors in the browser console), confirm the frontend is configured with the correct API URL and that the API allows your exact site origin. The Overview page shows API health when the check succeeds.
          </p>
          <p>
            For deploy checklists, local developer setup, and CI examples, see the <strong className="font-medium text-zinc-800 dark:text-zinc-200">README</strong> in the Foretrace repository.
          </p>
        </WorkflowStep>
      </article>
    </main>
  );
}
