import type { ReactNode } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../ui/PageHeader';

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-zinc-100 pt-10 first:border-t-0 first:pt-0 dark:border-zinc-800/80"
    >
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
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
        title="User guide"
        description={
          <>
            Foretrace combines <strong className="font-medium text-zinc-800 dark:text-zinc-200">tasks</strong>,{' '}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">GitHub activity</strong>, and{' '}
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">terminal signals</strong> from your
            team so you can see delivery risk, explain why scores changed, and act before deadlines slip.
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
        aria-label="On this page"
        className="mb-10 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <BookOpen size={14} strokeWidth={2} aria-hidden />
          On this page
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium">
          <li>
            <a href="#account" className="text-accent-700 hover:underline dark:text-accent-400">
              Account
            </a>
          </li>
          <li>
            <a href="#organizations" className="text-accent-700 hover:underline dark:text-accent-400">
              Organizations
            </a>
          </li>
          <li>
            <a href="#projects" className="text-accent-700 hover:underline dark:text-accent-400">
              Projects &amp; tasks
            </a>
          </li>
          <li>
            <a href="#github" className="text-accent-700 hover:underline dark:text-accent-400">
              GitHub
            </a>
          </li>
          <li>
            <a href="#terminal" className="text-accent-700 hover:underline dark:text-accent-400">
              Terminal &amp; CLI
            </a>
          </li>
          <li>
            <a href="#signals-risk" className="text-accent-700 hover:underline dark:text-accent-400">
              Signals &amp; risk
            </a>
          </li>
          <li>
            <a href="#alerts" className="text-accent-700 hover:underline dark:text-accent-400">
              Alerts
            </a>
          </li>
          <li>
            <a href="#settings" className="text-accent-700 hover:underline dark:text-accent-400">
              Settings &amp; audit
            </a>
          </li>
          <li>
            <a href="#tips" className="text-accent-700 hover:underline dark:text-accent-400">
              Tips
            </a>
          </li>
        </ul>
      </nav>

      <article className="max-w-3xl">
        <DocSection id="account" title="Account and sign-in">
          <p>
            Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Sign in</strong> in the header to
            register or log in. Your session stays active in this browser so you can refresh the page without
            losing access. Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Sign out</strong> when
            you are done on a shared machine.
          </p>
        </DocSection>

        <DocSection id="organizations" title="Organizations">
          <p>
            Everything is scoped to an <strong className="font-medium text-zinc-800 dark:text-zinc-200">organization</strong>
            : a workspace for your team. On the overview you can create an organization or open an existing one.
          </p>
          <p>
            Many URLs include <Code>?org=&lt;organization-id&gt;</Code> so the app knows which workspace you are
            viewing. If you have more than one organization, use the selector on pages like Projects, Alerts, or
            Settings to switch.
          </p>
        </DocSection>

        <DocSection id="projects" title="Projects and tasks">
          <p>
            Open <strong className="font-medium text-zinc-800 dark:text-zinc-200">Projects</strong> to see all projects
            in the current organization. Expand a project to manage <strong className="font-medium text-zinc-800 dark:text-zinc-200">tasks</strong>
            : add items, track status, and archive work when it is done.
          </p>
          <p>
            Project members with the right role can invite teammates and manage project-level tools (GitHub, CLI
            tokens, risk evaluation) from the same expanded view.
          </p>
        </DocSection>

        <DocSection id="github" title="GitHub">
          <p>
            Link a repository to a project so Foretrace can read webhook deliveries (pushes, PRs, issues) into the
            signal rollup. An admin or PM typically connects the repo, copies the one-time <strong className="font-medium text-zinc-800 dark:text-zinc-200">webhook secret</strong>, and
            registers the webhook URL in GitHub repository settings.
          </p>
          <p>
            Optional: store a <strong className="font-medium text-zinc-800 dark:text-zinc-200">personal access token</strong> for REST-backed fields (open PR/issue counts, default branch status) when your org enables that integration. Tokens are encrypted at rest; only use the minimum scopes your policy allows.
          </p>
          <p>
            You can map GitHub logins to Foretrace users so activity lines up with people in your workspace.
          </p>
        </DocSection>

        <DocSection id="terminal" title="Terminal and CLI ingest">
          <p>
            Ship redacted terminal output from builds and scripts so incidents appear in the project without pasting
            logs into chat. Each project can mint one or more <strong className="font-medium text-zinc-800 dark:text-zinc-200">CLI ingest tokens</strong> (shown only once). Tokens are tied to that project; if the token leaks, revoke it and mint a new one.
          </p>
          <p>
            From your machine or CI, set environment variables (names are fixed):
          </p>
          <ul className="list-inside list-disc space-y-1 pl-1">
            <li>
              <Code>FORETRACE_API_URL</Code> — your API base URL, no trailing slash (for example your Render URL).
            </li>
            <li>
              <Code>FORETRACE_TOKEN</Code> — the <Code>ft_ck_…</Code> token from the dashboard.
            </li>
            <li>
              <Code>FORETRACE_ORGANIZATION_ID</Code> and <Code>FORETRACE_PROJECT_ID</Code> — UUIDs from the URL or UI.
            </li>
            <li>
              Optional: <Code>FORETRACE_TASK_ID</Code> to attach lines to a specific task.
            </li>
          </ul>
          <p>
            Build the CLI from the repo (<Code>npm run build -w @foretrace/cli</Code>), then pipe command output into{' '}
            <Code>npm run terminal:ingest</Code> from the monorepo root, or use <Code>foretrace ingest</Code> /{' '}
            <Code>foretrace run -- &lt;command&gt;</Code> after installing the CLI package. The API validates each batch and applies basic redaction before storing fingerprints for the <strong className="font-medium text-zinc-800 dark:text-zinc-200">Terminal incidents</strong> panel.
          </p>
        </DocSection>

        <DocSection id="signals-risk" title="Signals and delivery risk">
          <p>
            The <strong className="font-medium text-zinc-800 dark:text-zinc-200">Signals</strong> panel shows a rolling snapshot (for example the last 24 hours): GitHub activity, terminal batches and incidents, and task pressure (overdue and due-soon counts). PMs and admins can <strong className="font-medium text-zinc-800 dark:text-zinc-200">Refresh</strong> to recompute on demand.
          </p>
          <p>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Delivery risk</strong> scores the project from that snapshot using explainable rules. Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Evaluate</strong> to refresh signals and write a new evaluation row. History lists past runs; an optional short narrative may appear when your workspace is configured for it.
          </p>
        </DocSection>

        <DocSection id="alerts" title="Alerts">
          <p>
            When risk crosses meaningful thresholds (for example first time at medium or higher, or a worsening trend), Foretrace can create <strong className="font-medium text-zinc-800 dark:text-zinc-200">alerts</strong> for the organization. Open <strong className="font-medium text-zinc-800 dark:text-zinc-200">Alerts</strong> to read the inbox, filter unread items, mark them read, and jump back to the relevant project.
          </p>
        </DocSection>

        <DocSection id="settings" title="Settings and audit log">
          <p>
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Settings</strong> shows a read-only audit trail of recent actions in the organization (who did what and when). Sign in is required to load audit entries.
          </p>
        </DocSection>

        <DocSection id="tips" title="Tips and troubleshooting">
          <p>
            If the browser cannot reach the API (CORS or network errors), confirm the deployed API allows your
            exact site origin and that the frontend is configured with the correct API URL. The overview page shows API health when it can reach the server.
          </p>
          <p>
            This guide tracks the product as shipped; your team may run a fork with extra features. For deploy
            checklists and developer setup, refer to the <strong className="font-medium text-zinc-800 dark:text-zinc-200">README</strong> in the Foretrace repository.
          </p>
        </DocSection>
      </article>
    </main>
  );
}
