import type { ReactNode } from 'react';
import { ArrowLeft, BookOpen, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  FORETRACE_VSCODE_DOWNLOAD_PATH,
  FORETRACE_VSCODE_FILENAME,
  FORETRACE_VSCODE_VERSION,
} from '../../lib/foretrace-vscode-download';
import { PageHeader } from '../ui/PageHeader';

const STEPS = [
  { id: 'before-you-start', label: 'Start here' },
  { id: 'step-1', label: '1 · Account' },
  { id: 'step-2', label: '2 · Organization' },
  { id: 'step-3', label: '3 · Project' },
  { id: 'step-4', label: '4 · Tasks' },
  { id: 'step-5', label: '5 · GitHub' },
  { id: 'github-issues-tasks', label: 'GitHub ↔ tasks' },
  { id: 'step-6', label: '6 · CLI / terminal' },
  { id: 'step-7', label: '7 · VS Code / Cursor extension' },
  { id: 'step-8', label: '8 · Signals & risk' },
  { id: 'step-9', label: '9 · Alerts' },
  { id: 'step-10', label: '10 · Settings' },
  { id: 'step-11', label: '11 · Every day' },
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
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function StartSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-accent-200/60 bg-accent-500/[0.06] p-6 dark:border-accent-800/40 dark:bg-accent-500/[0.08]"
    >
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
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

function PreBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-zinc-300 bg-zinc-950 p-4 text-[11px] leading-relaxed text-zinc-100 shadow-inner dark:border-zinc-600">
      {children}
    </pre>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-50">
      <p className="font-semibold text-amber-900 dark:text-amber-100">{title}</p>
      <div className="mt-2 space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
      {children}
    </div>
  );
}

export function DocumentationPage() {
  return (
    <main className="pb-20">
      <PageHeader
        eyebrow="Help"
        title="Complete setup guide"
        description={
          <>
            This page explains <strong className="font-medium text-zinc-800 dark:text-zinc-200">every part</strong> of Foretrace in order: what to click, what to
            type, and where each piece of information comes from. Read <strong className="font-medium text-zinc-800 dark:text-zinc-200">Start here</strong> first,
            then follow the numbered steps. You can skip optional steps and come back later.
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
          Jump to a section
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

      <article className="max-w-3xl space-y-10">
        <StartSection id="before-you-start" title="Start here — read this before anything else">
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">What Foretrace is:</strong> a website in your browser (the “app”) that talks to a separate{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">server</strong> (the “API”) over the internet. Your projects, tasks, and alerts live on that
            server inside a database. You never paste the database password into the app—only the people who deploy Foretrace configure that on the server.
          </p>
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">Three names you must know:</strong>
          </p>
          <ul className="list-inside list-disc space-y-2 pl-1">
            <li>
              <strong className="text-zinc-800 dark:text-zinc-200">Organization</strong> — your team’s workspace. Everything is grouped under one organization
              at a time.
            </li>
            <li>
              <strong className="text-zinc-800 dark:text-zinc-200">Project</strong> — one product, release, or initiative inside that organization.
            </li>
            <li>
              <strong className="text-zinc-800 dark:text-zinc-200">Task</strong> — a single piece of work inside a project (a ticket-sized item).
            </li>
          </ul>
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">Two different “addresses”:</strong> the{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">website address</strong> is what you type in the browser (often a <Code>vercel.app</Code> URL).
            The <strong className="text-zinc-800 dark:text-zinc-200">API address</strong> is a different URL (often an <Code>onrender.com</Code> URL) that the
            website calls in the background. <strong className="text-zinc-800 dark:text-zinc-200">Only people who set up hosting</strong> choose both addresses;
            testers usually receive both links in an email or chat message.
          </p>
          <Note title="Important: website settings are not the same as CLI settings">
            <p>
              Variables that start with <Code>VITE_</Code> belong to the <strong>frontend build</strong> (for example on Vercel). They help the <em>browser</em>{' '}
              find the API. They are <strong>not</strong> where you put <Code>FORETRACE_TOKEN</Code>.
            </p>
            <p>
              Variables that start with <Code>FORETRACE_</Code> are read by the <strong>CLI program on your computer or in CI</strong>. You put them in your
              terminal session, a small text file you load yourself, or your CI “secrets” screen—explained step by step in section 6.
            </p>
          </Note>
          <Tip>
            <strong className="text-zinc-800 dark:text-zinc-200">Rule of thumb:</strong> if you are only clicking in the browser, you only need the website
            link and an account. If you are piping build logs into Foretrace, you also need the API link, the four <Code>FORETRACE_*</Code> values, and the CLI
            installed once.
          </Tip>
        </StartSection>

        <WorkflowStep step={1} id="step-1" title="Create an account and sign in">
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Open the <strong className="text-zinc-800 dark:text-zinc-200">website link</strong> your team gave you (it should start with <Code>https://</Code>
              ).
            </li>
            <li>
              Look at the <strong className="text-zinc-800 dark:text-zinc-200">top-right</strong> of the page. Click <strong className="text-zinc-800 dark:text-zinc-200">Sign in</strong>.
            </li>
            <li>
              If you have never used Foretrace on this site before, choose <strong className="text-zinc-800 dark:text-zinc-200">register</strong> (or the option
              to create a new account), type your <strong>email</strong> and a <strong>password</strong> you can remember, and complete the form.
            </li>
            <li>
              If you already registered, choose <strong className="text-zinc-800 dark:text-zinc-200">log in</strong> and enter the same email and password.
            </li>
            <li>
              When login works, the header should show your <strong className="text-zinc-800 dark:text-zinc-200">email</strong> and a <strong>Sign out</strong>{' '}
              button. You can refresh the page; you should stay signed in until you click Sign out or clear browser data.
            </li>
          </ol>
          <Note title="Shared computer">
            Always click <strong>Sign out</strong> when you finish on a school, library, or family PC so the next person cannot see your workspace.
          </Note>
        </WorkflowStep>

        <WorkflowStep step={2} id="step-2" title="Create or open your organization (workspace)">
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              After sign-in, you land on the <strong className="text-zinc-800 dark:text-zinc-200">Overview</strong> page. On the right side, find the card titled{' '}
              <strong className="text-zinc-800 dark:text-zinc-200">Organizations</strong>.
            </li>
            <li>
              If it says there are <strong>no workspaces yet</strong>, click the button <strong className="text-zinc-800 dark:text-zinc-200">Create organization</strong>.
              A window will open—type a <strong>name</strong> for your team (for example your company name) and follow the prompts until it saves.
            </li>
            <li>
              If your team already created an organization and <strong>invited you</strong>, you should see it listed after you accept the invite (depending on
              how your team set that up). Click it or follow their link so that organization becomes active.
            </li>
            <li>
              Your <strong className="text-zinc-800 dark:text-zinc-200">organization id</strong> is a long random value (letters, numbers, dashes). On the{' '}
              <strong>Overview</strong>, the <strong>Organizations</strong> card lists each workspace name with its ID and a <strong>Copy ID</strong> button.
              On <strong>Projects</strong> and <strong>Settings</strong>, an <strong>Organization ID</strong> box appears under the organization picker with the
              same copy action. The address bar may also show <Code>?org=</Code> followed by the same id.
            </li>
          </ol>
          <p>
            If you belong to <strong>more than one</strong> organization, use the <strong className="text-zinc-800 dark:text-zinc-200">dropdown</strong> on
            Projects, Alerts, or Settings to pick which workspace you are working in before you copy ids or mint tokens.
          </p>
        </WorkflowStep>

        <WorkflowStep step={3} id="step-3" title="Create a project inside that organization">
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Click <strong className="text-zinc-800 dark:text-zinc-200">Projects</strong> in the <strong>left sidebar</strong> (on a phone, open the menu with
              the three lines, then tap Projects).
            </li>
            <li>
              Make sure the <strong className="text-zinc-800 dark:text-zinc-200">correct organization</strong> is selected (see the note above if you have
              more than one).
            </li>
            <li>
              Find the box where you can type a <strong>new project name</strong>. Type something clear (for example “Mobile app 2.0”) and click the button to{' '}
              <strong>create</strong> the project.
            </li>
            <li>
              The new project appears in the list. <strong className="text-zinc-800 dark:text-zinc-200">Click the row</strong> or the expand control so the row
              opens downward. All tools for that project—tasks, GitHub, CLI tokens, signals, risk—appear <strong>inside this expanded area</strong>.
            </li>
            <li>
              To copy the <strong className="text-zinc-800 dark:text-zinc-200">project id</strong> for the CLI: open your browser’s address bar while you are
              focused on that project, or ask your admin—project ids are created by Foretrace when the project is saved; they look like long random strings with
              dashes (UUIDs).
            </li>
          </ol>
          <Tip>
            If someone says “open the project panel,” they mean: Projects → expand that project so you see the sections stacked below the title.
          </Tip>
        </WorkflowStep>

        <WorkflowStep step={4} id="step-4" title="Add tasks (so Foretrace can measure real work)">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            <strong className="text-zinc-800 dark:text-zinc-200">Organization admins</strong> create tasks. PMs can assign people and edit details on existing tasks.
          </p>
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              With the project expanded, scroll to the <strong className="text-zinc-800 dark:text-zinc-200">tasks</strong> area.
            </li>
            <li>
              As an <strong>admin</strong>, type a <strong>short title</strong> for the work (for example “Fix login bug”) in the add-task field and submit. Repeat for each real item you
              want to track.
            </li>
            <li>
              Set <strong>status</strong> and <strong>due dates</strong> the way your team works. Overdue and due-soon tasks feed the <strong>Signals</strong>{' '}
              and <strong>Risk</strong> views later.
            </li>
            <li>
              When work is finished, <strong>archive</strong> or clean up tasks so numbers stay honest.
            </li>
          </ol>
          <p>
            Each task row has an id in the system (another UUID). If you use the optional <Code>FORETRACE_TASK_ID</Code> in the CLI, it must be{' '}
            <strong>exactly</strong> that task’s id and the task must belong to <strong>this</strong> project—otherwise the server will reject the upload.
          </p>
          <Tip>
            If your team uses <strong>GitHub</strong> for code, the smoothest path is: create a <strong>real GitHub issue per task</strong> (or per stream of work),
            then put that issue’s <strong>number</strong> on the matching Foretrace task after you connect the repo (see{' '}
            <a href="#step-5" className="font-semibold text-accent-700 underline dark:text-accent-400">
              step 5
            </a>
            ). That number is how webhooks know <em>which task</em> a commit or PR comment belongs to.
          </Tip>
        </WorkflowStep>

        <WorkflowStep step={5} id="step-5" title="Optional: connect GitHub (admin or PM)">
          <p>
            Skip this whole section if you do not use GitHub yet. You can always return when you are ready.
          </p>
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Expand the project, then open the <strong className="text-zinc-800 dark:text-zinc-200">GitHub</strong> section.
            </li>
            <li>
              Type the repository in the form <Code>owner/repo</Code> (all lowercase, with one slash). Example: <Code>acme/widget</Code>.
            </li>
            <li>
              Click to <strong>connect</strong>. Foretrace will show two critical things once: a <strong>webhook URL</strong> and a <strong>webhook secret</strong>.
              Copy both into a safe place immediately—you cannot get the secret again from the same screen.
            </li>
            <li>
              In GitHub in that repository, go to <strong>Settings → Webhooks → Add webhook</strong>. Paste the <strong>Payload URL</strong> from Foretrace,
              choose <strong>application/json</strong>, and paste the <strong>secret</strong>. Save.
            </li>
            <li>
              After GitHub sends events, Foretrace stores them and they count toward <strong>Signals</strong>. If nothing appears, ask your admin to confirm the
              API’s public URL matches what GitHub can reach.
            </li>
            <li>
              <strong>Optional PAT:</strong> only if your policy allows, you can save a GitHub personal access token in Foretrace for extra REST fields (counts,
              branch status). Use the smallest permission set your security team approves.
            </li>
            <li>
              <strong>User mapping:</strong> link GitHub usernames to Foretrace accounts so activity lines up with people you know in the app (details below).
            </li>
          </ol>

          <h3
            id="github-issues-tasks"
            className="text-base font-semibold text-zinc-800 dark:text-zinc-200"
          >
            Create GitHub issues, then copy the issue number into Foretrace
          </h3>
          <p>
            Foretrace matches GitHub <strong>webhooks</strong> to a task by the <strong>issue number</strong>: something in the event (for example{' '}
            <Code>#42</Code> in a commit message or PR text) must match the <strong>GitHub issue #</strong> field saved on that task in the{' '}
            <strong>same</strong> connected project. Without a real issue number in GitHub and the same number on the task, those automatic “this push belongs
            to this task” updates will not attach.
          </p>
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              In GitHub, open the <strong>same repository</strong> you typed as <Code>owner/repo</Code> in Foretrace.
            </li>
            <li>
              Go to <strong>Issues</strong> → <strong>New issue</strong>. Give it a clear title and description, then create it.
            </li>
            <li>
              Note the <strong>issue number</strong> GitHub assigned (for example <Code>#42</Code> in the issue title line or in the browser URL). Every new
              issue gets the next number in that repo—you cannot pick an arbitrary number.
            </li>
            <li>
              <strong>Optional but tidy on GitHub:</strong> use <strong>Assignees</strong> on the GitHub issue for the developer who will do the work (Alice,
              Paul, …). Foretrace does <strong>not</strong> require this for matching; it only helps your team read GitHub. <strong>Who owns the work in
              Foretrace</strong> is the task’s <strong>Assign to</strong> field (PM/admin).
            </li>
            <li>
              In Foretrace → <strong>Projects</strong> → expand the project → find the task for that work (or create it as an admin). Set <strong>GitHub issue
              #</strong> to <strong>exactly</strong> that number (for example <Code>42</Code>). Set <strong>Assign to</strong> to the right developer.
            </li>
            <li>
              Repeat for each developer: one GitHub issue per stream of work, one Foretrace task with that issue number and the right assignee. Example: three
              issues in GitHub (#10, #11, #12) → three Foretrace tasks with those numbers → Alice, Paul, and Boris each assigned on their own task.
            </li>
            <li>
              Ask each developer to open the project’s <strong>GitHub</strong> section and <strong>link their GitHub username</strong> to their Foretrace account.
              Then when GitHub sends <Code>@theirlogin</Code>, Foretrace can show their <strong>name in the app</strong>. If someone skips linking, you still see
              the raw GitHub login on activity.
            </li>
            <li>
              Developers should reference the issue in GitHub when they work: for example commit messages like <Code>Fix login (#42)</Code> or PR titles/bodies
              that include <Code>#42</Code>. That is what lets the webhook payload mention the same number Foretrace stored on the task.
            </li>
          </ol>
          <Note title="Two different “who owns this?” ideas">
            <p>
              <strong>Foretrace assignee</strong> = whose task row this is for deadlines, risk, and permissions. <strong>GitHub assignee</strong> on the issue =
              optional label inside GitHub only.
            </p>
            <p>
              <strong>Who triggered a GitHub event</strong> comes from GitHub’s actor (for example the commit <Code>pusher</Code> or PR author). If that person
              is not the Foretrace assignee, Foretrace may still show the activity on the task (because the <strong>issue numbers matched</strong>) and can warn
              that the last linked GitHub user differs from the assignee—so the PM can notice pairing or handoffs.
            </p>
            <p>
              <strong>GitHub “closed / completed” and merged PRs:</strong> when a webhook matches a task by issue number, Foretrace sets{' '}
              <strong>Progress</strong> to <strong>100%</strong> and <strong>Status</strong> to <strong>Done</strong> if GitHub sends an <strong>issues</strong>{' '}
              <Code>closed</Code> action, or a <strong>pull_request</strong> <Code>closed</Code> with <Code>merged: true</Code> (and the PR body/title referenced that
              issue). Reopening the issue on GitHub sets the task back to <strong>In progress</strong> with <strong>0%</strong> progress. A successful{' '}
              <strong>workflow_run</strong> (<Code>completed</Code> + <Code>success</Code>) that still matches the issue bumps progress by up to 10 points (capped
              at 100) without forcing Done—useful for CI passing before the issue is formally closed.
            </p>
          </Note>

          <Tip>
            <strong className="text-zinc-800 dark:text-zinc-200">Quick checks when activity looks empty:</strong> in GitHub open the webhook’s{' '}
            <strong>Recent Deliveries</strong>—each row should be <strong>200</strong> (if not, fix URL, secret, or content type). Enable at least{' '}
            <strong>Push</strong>, <strong>Pull requests</strong>, and <strong>Issues</strong> (required for <strong>close / reopen / complete</strong> issue
            events) so Foretrace receives them. <strong>GitHub Actions</strong> deliveries (<strong>workflow run</strong>, <strong>workflow job</strong>,{' '}
            <strong>check suite</strong>, <strong>check run</strong>, <strong>deployment</strong>) are supported too: Foretrace scans commit messages, run titles,
            and linked PR titles/bodies for <Code>#42</Code>-style references (same idea as <strong>push</strong> commits)—so CI can update a task when the PR or
            commit text references the issue. Confirm the Foretrace task’s <strong>GitHub issue #</strong> equals the real issue number in{' '}
            <strong>that same repo</strong> you connected. To save an optional classic or fine-grained <strong>PAT</strong> in Foretrace, the API host must have{' '}
            <Code>FORETRACE_APP_SECRET</Code> set (see your deploy docs), then use <strong>Save PAT</strong> once and refresh <strong>Signals</strong>.{' '}
            <strong>PR combined status</strong> needs a valid <strong>PR #</strong> and a PAT that can read pulls; “unknown” often means no PR yet, wrong PR number,
            or GitHub’s legacy status endpoint is empty for that commit (Checks-only repos).
          </Tip>
        </WorkflowStep>

        <WorkflowStep step={6} id="step-6" title="Optional: send terminal / build logs with the CLI">
          <p>
            This section is for <strong className="text-zinc-800 dark:text-zinc-200">developers or automation</strong>. The website does <strong>not</strong>{' '}
            have a box for <Code>FORETRACE_TOKEN</Code>. Those values go on the machine that runs the command line tool.
          </p>

          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">Part A — Mint a token in the browser</h3>
          <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Sign in, go to <strong>Projects</strong>, expand the right project.
            </li>
            <li>
              Find <strong className="text-zinc-800 dark:text-zinc-200">CLI ingest tokens</strong> (or similar wording). Click to <strong>mint</strong> a new token.
            </li>
            <li>
              Foretrace shows a long secret starting with <Code>ft_ck_</Code>. <strong>Copy it once</strong> into a password manager or your CI secrets vault.
              The database only stores a fingerprint of the token—you cannot “view” the same secret again later; if you lose it, <strong>revoke</strong> and mint
              a new one.
            </li>
          </ol>

          <h3 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-200">Part B — Where the FORETRACE variables go</h3>
          <p>
            The CLI reads <strong>environment variables</strong> from the process that runs it. You choose <strong>one</strong> of these patterns:
          </p>
          <ul className="list-inside list-disc space-y-2 pl-1">
            <li>
              <strong>Temporary for one terminal window (good for trying once):</strong> set variables, then run the CLI in the <em>same</em> window.
            </li>
            <li>
              <strong>CI (GitHub Actions, GitLab, etc.):</strong> add secrets in the website of your CI provider, then map them into <Code>env:</Code> for the job
              step that runs Foretrace.
            </li>
          </ul>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Windows (PowerShell) — copy-paste one block, edit the values, press Enter after each line:</p>
          <PreBlock>{`$env:FORETRACE_API_URL = "https://YOUR-API.onrender.com"
$env:FORETRACE_TOKEN = "ft_ck_paste_the_full_token_here"
$env:FORETRACE_ORGANIZATION_ID = "paste-org-uuid-from-browser"
$env:FORETRACE_PROJECT_ID = "paste-project-uuid"
# Optional — only if you really have a task UUID:
# $env:FORETRACE_TASK_ID = "paste-task-uuid"`}</PreBlock>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Mac or Linux (bash or zsh) — same idea:</p>
          <PreBlock>{`export FORETRACE_API_URL="https://YOUR-API.onrender.com"
export FORETRACE_TOKEN="ft_ck_paste_the_full_token_here"
export FORETRACE_ORGANIZATION_ID="paste-org-uuid-from-browser"
export FORETRACE_PROJECT_ID="paste-project-uuid"
# Optional:
# export FORETRACE_TASK_ID="paste-task-uuid"`}</PreBlock>
          <Note title="Plain .env files and the CLI">
            <p>
              The <Code>foretrace</Code> program <strong>does not automatically read a .env file</strong> from your disk. If you put lines in a file named{' '}
              <Code>.env</Code>, you must either <strong>export</strong> them into the shell first (some teams use small helper scripts) or use the repo’s{' '}
              <Code>npm run smoke:terminal-ingest</Code> script, which <em>does</em> load a root <Code>.env</Code> for smoke testing—not the same as everyday{' '}
              <Code>foretrace ingest</Code>.
            </p>
            <p>
              So: for a normal run, use <strong>PowerShell export</strong>, <strong>bash export</strong>, or <strong>CI secrets → env</strong> as shown above.
            </p>
          </Note>

          <h3 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-200">Part C — Install the CLI and send one test</h3>
          <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Clone the Foretrace git repository (or use a copy your team gives you). In the repository root, run{' '}
              <Code>npm install</Code> once, then <Code>npm run build -w @foretrace/cli</Code> so <Code>packages/cli/dist/cli.js</Code> exists.
            </li>
            <li>
              With the environment variables still set in the <strong>same</strong> terminal, stay in the repo root and run a one-line test that works on
              Windows and Mac:{' '}
              <Code>node -e &quot;console.log(&apos;foretrace-cli-test&apos;)&quot; | node packages/cli/dist/cli.js ingest</Code> — that prints one line and
              pipes it into ingest. Or use <Code>npm run terminal:ingest</Code> the same way with a pipe in front (that script runs the same CLI file; env vars
              must still be set in that shell).
            </li>
            <li>
              Go back to the browser → expand the project → <strong>Terminal incidents</strong>. After a short delay you should see the new fingerprinted line
              (redacted). If the command printed an error with “401” or “403”, your token or ids do not match—double-check copy-paste and that the token was not
              revoked.
            </li>
          </ol>
        </WorkflowStep>

        <WorkflowStep step={7} id="step-7" title="Install the VS Code / Cursor extension (optional)">
          <p>
            Use this when you want to send integrated-terminal or editor output from{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">Visual Studio Code</strong> or{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">Cursor</strong> to Foretrace without piping through the CLI on every command.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={FORETRACE_VSCODE_DOWNLOAD_PATH}
              download={FORETRACE_VSCODE_FILENAME}
              className="inline-flex items-center gap-2 rounded-xl border border-accent-600 bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-[box-shadow,transform] hover:bg-accent-600 active:scale-[0.99] dark:border-accent-500 dark:bg-accent-600 dark:hover:bg-accent-500"
            >
              <Download size={18} strokeWidth={2.5} aria-hidden />
              Download extension ({FORETRACE_VSCODE_VERSION})
            </a>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              File: <Code>{FORETRACE_VSCODE_FILENAME}</Code>
            </span>
          </div>
          <Note title="If the download returns 404">
            <p>
              From the repository root run <Code>npm install --include=dev</Code> then <Code>npm run sync-web-vsix</Code>, then restart the web dev server. Production
              builds run this automatically before packaging the site.
            </p>
          </Note>
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">Install in the editor</h3>
          <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Download the <Code>.vsix</Code> using the button above.
            </li>
            <li>
              Open <strong className="text-zinc-800 dark:text-zinc-200">Extensions</strong> (<Code>Ctrl+Shift+X</Code> / <Code>Cmd+Shift+X</Code>).
            </li>
            <li>
              Open the <strong>⋯</strong> menu on the Extensions sidebar → <strong className="text-zinc-800 dark:text-zinc-200">Install from VSIX…</strong> → choose the
              downloaded file.
            </li>
            <li>
              Reload the editor if prompted so Foretrace commands appear in the command palette.
            </li>
          </ol>
          <h3 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-200">Connect to your project</h3>
          <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              In <strong className="text-zinc-800 dark:text-zinc-200">Settings</strong>, search <strong>Foretrace</strong> and set <Code>foretrace.apiBaseUrl</Code> (API
              origin, no trailing slash), <Code>foretrace.organizationId</Code>, and <Code>foretrace.projectId</Code> — same values as in sections 2–3 and the CLI
              variables in section 6.
            </li>
            <li>
              Mint a <strong className="text-zinc-800 dark:text-zinc-200">CLI ingest token</strong> in the browser (starts with <Code>ft_ck_</Code>).
            </li>
            <li>
              Command palette → <strong className="text-zinc-800 dark:text-zinc-200">Foretrace: Set CLI token</strong> — paste the token once (stored in editor secret
              storage, not in your repo).
            </li>
            <li>
              Run <strong className="text-zinc-800 dark:text-zinc-200">Foretrace: Send test batch</strong> to verify the API. Optional:{' '}
              <strong>Start terminal capture</strong> — on <strong className="text-zinc-800 dark:text-zinc-200">stable VS Code</strong> you must launch the app with{' '}
              <Code>--enable-proposed-api foretrace.foretrace-vscode</Code> (see the extension README for a copy-paste command); otherwise use{' '}
              <strong>Send editor selection</strong> or the CLI in section 6.
            </li>
          </ol>
        </WorkflowStep>

        <WorkflowStep step={8} id="step-8" title="Read signals, then run delivery risk">
          <ol className="list-decimal space-y-4 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Expand the project and open <strong className="text-zinc-800 dark:text-zinc-200">Signals</strong>. You should see counts for GitHub (if connected),
              terminal activity, and tasks.
            </li>
            <li>
              If you are a PM or admin and numbers look old, click <strong>Refresh</strong> to force a new snapshot.
            </li>
            <li>
              Scroll to <strong className="text-zinc-800 dark:text-zinc-200">Delivery risk</strong>. Click <strong>Evaluate</strong>. Foretrace refreshes signals,
              computes a level and reasons, and saves a row in <strong>Evaluation history</strong>.
            </li>
            <li>
              Optional: click <strong>Trace Analyst</strong> in the same panel for a narrative read across tasks, terminal incidents, and the signal rollup. That
              run refreshes the snapshot but does not add a new evaluation row.
            </li>
            <li>
              Run <strong>Evaluate</strong> again whenever you want an updated score (for example after a big merge day).
            </li>
          </ol>
        </WorkflowStep>

        <WorkflowStep step={9} id="step-9" title="Check alerts">
          <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Click <strong className="text-zinc-800 dark:text-zinc-200">Alerts</strong> in the sidebar.
            </li>
            <li>
              Pick the same organization if a selector is shown.
            </li>
            <li>
              Read each line, use <strong>Unread only</strong> if you want a short list, and click <strong>Mark read</strong> when you have handled an item.
            </li>
            <li>
              Use the link back to <strong>Projects</strong> when you need to fix the underlying work.
            </li>
          </ol>
        </WorkflowStep>

        <WorkflowStep step={10} id="step-10" title="Settings and audit log">
          <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-zinc-500">
            <li>
              Click <strong className="text-zinc-800 dark:text-zinc-200">Settings</strong> in the sidebar.
            </li>
            <li>
              Choose the organization if prompted.
            </li>
            <li>
              Read the <strong>audit log</strong> table—it is read-only and lists who did what recently (invites, tokens, GitHub actions, evaluations, etc.).
            </li>
          </ol>
        </WorkflowStep>

        <WorkflowStep step={11} id="step-11" title="What you do every day — and when something breaks">
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">Healthy routine:</strong> keep tasks true, let GitHub webhooks and the CLI feed data, hit{' '}
            <strong>Refresh</strong> or <strong>Evaluate</strong> when you need a fresh readout, clear alerts after you act, and glance at the audit log after
            sensitive changes.
          </p>
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">If the website looks “empty” or login never finishes:</strong> ask your admin whether the{' '}
            <strong>API URL</strong> on the frontend matches the live server and whether <strong>CORS</strong> allows your exact website address. The Overview
            page shows a small <strong>API health</strong> hint when the browser can reach the server.
          </p>
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">If the CLI says ingest failed:</strong> read the error text. <Code>401</Code> usually means
            wrong or revoked token. <Code>403</Code> means the token does not belong to the org/project in the URL. <Code>400</Code> often means bad JSON or a{' '}
            <Code>FORETRACE_TASK_ID</Code> that is not in this project.
          </p>
          <p>
            <strong className="text-zinc-800 dark:text-zinc-200">Deeper deploy topics</strong> (Render, Vercel, database backups, GitHub org rules) live in the
            repository <strong>README</strong>—share that file with whoever runs infrastructure.
          </p>
        </WorkflowStep>
      </article>
    </main>
  );
}
