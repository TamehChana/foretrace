#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { parseTerminalIngestBatch } from '@foretrace/shared';

type ForetraceEnv = {
  apiUrl: string;
  token: string;
  orgId: string;
  projectId: string;
  taskId?: string;
};

/** HTTP headers must be Latin-1 / ByteString; catch smart quotes or `…` from copied docs. */
function assertHeaderAscii(label: string, value: string): void {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c > 0x7f) {
      console.error(
        `${label} contains a non-ASCII character at index ${i} (code ${c}). ` +
          `Paste the real value from Foretrace — not a placeholder like ft_ck_… from documentation.`,
      );
      process.exit(1);
    }
  }
}

function readForetraceEnv(): ForetraceEnv {
  const apiUrl = process.env.FORETRACE_API_URL?.trim().replace(/\/+$/, '');
  const token = process.env.FORETRACE_TOKEN?.trim() ?? '';
  const orgId = process.env.FORETRACE_ORGANIZATION_ID?.trim() ?? '';
  const projectId = process.env.FORETRACE_PROJECT_ID?.trim() ?? '';
  const taskRaw = process.env.FORETRACE_TASK_ID?.trim();
  const taskId =
    taskRaw !== undefined && taskRaw.length > 0 ? taskRaw : undefined;

  if (!apiUrl) {
    console.error('FORETRACE_API_URL is required');
    process.exit(1);
  }
  if (!token) {
    console.error('FORETRACE_TOKEN is required');
    process.exit(1);
  }
  if (!orgId) {
    console.error('FORETRACE_ORGANIZATION_ID is required');
    process.exit(1);
  }
  if (!projectId) {
    console.error('FORETRACE_PROJECT_ID is required');
    process.exit(1);
  }

  assertHeaderAscii('FORETRACE_API_URL', apiUrl);
  assertHeaderAscii('FORETRACE_TOKEN', token);
  assertHeaderAscii('FORETRACE_ORGANIZATION_ID', orgId);
  assertHeaderAscii('FORETRACE_PROJECT_ID', projectId);
  if (taskId) {
    assertHeaderAscii('FORETRACE_TASK_ID', taskId);
  }

  if (!token.startsWith('ft_ck_')) {
    console.error(
      'FORETRACE_TOKEN should start with ft_ck_ (mint a CLI ingest token in the Foretrace project dashboard).',
    );
    process.exit(1);
  }

  return { apiUrl, token, orgId, projectId, taskId };
}

function linesFromOutput(raw: string, maxBytes = 400_000): string[] {
  const sliced =
    raw.length > maxBytes ? raw.slice(-maxBytes) : raw;
  return sliced
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(0, 320);
}

async function postIngest(
  env: ForetraceEnv,
  lines: string[],
  clientExtra?: { revision?: string },
  options?: { quiet?: boolean },
): Promise<void> {
  if (lines.length === 0) {
    return;
  }
  const payload = parseTerminalIngestBatch({
    ...(env.taskId ? { taskId: env.taskId } : {}),
    lines,
    client: {
      host: hostname(),
      cwd: process.cwd(),
      ...clientExtra,
    },
  });

  const url = `${env.apiUrl}/organizations/${encodeURIComponent(env.orgId)}/projects/${encodeURIComponent(env.projectId)}/terminal/batches`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const textOut = await res.text();
  if (!res.ok) {
    console.error(`Ingest failed (${res.status}): ${textOut}`);
    process.exit(1);
  }

  if (options?.quiet) {
    return;
  }

  try {
    const json = JSON.parse(textOut) as unknown;
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(textOut);
  }
}

async function main(): Promise<void> {
  const [, , cmd = 'help'] = process.argv;

  if (cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp();
    return;
  }

  if (cmd === 'ingest') {
    await runIngest();
    return;
  }

  if (cmd === 'run') {
    await runWrappedCommand();
    return;
  }

  if (cmd === 'hook') {
    const sub = process.argv[3];
    if (sub === 'print-zsh') {
      printZshSnippet();
      return;
    }
    if (sub === 'print-bash') {
      printBashSnippet();
      return;
    }
    printHookHelp();
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

function printHookHelp(): void {
  console.log(`foretrace hook — print one-time shell snippets

  foretrace hook print-zsh   Snippet for ~/.zshrc (wrapper + optional alias)
  foretrace hook print-bash  Snippet for ~/.bashrc

Set FORETRACE_WRAP=1 after pasting to enable the ftx() wrapper.
`);
}

function printZshSnippet(): void {
  console.log(`# --- Foretrace (paste once into ~/.zshrc) ---
# Requires: foretrace on PATH + FORETRACE_* env vars (see foretrace --help).
# Use: ftx npm run build   # capture + ingest in one step
# Or:  FORETRACE_WRAP=1 + alias (see comments — global npm alias is risky).

ftx() { command foretrace run -- "$@"; }

# Optional: only if your whole team agrees — intercepts npm in this shell only.
# FORETRACE_WRAP=1
# alias npm='ftx npm'
# --- end Foretrace ---
`);
}

function printBashSnippet(): void {
  console.log(`# --- Foretrace (paste once into ~/.bashrc) ---
# Requires: foretrace on PATH + FORETRACE_* env vars.
ftx() { command foretrace run -- "$@"; }
# Usage: ftx npm run build
# --- end Foretrace ---
`);
}

function printHelp(): void {
  console.log(`Foretrace CLI

Usage:
  foretrace ingest              Read stdin (lines) and POST to the API.
  foretrace run -- <cmd> [args] Run a command, capture stdout/stderr, POST lines (see below).
  foretrace hook print-zsh      Print a ~/.zshrc snippet (ftx wrapper).
  foretrace hook print-bash     Print a ~/.bashrc snippet.

Environment (ingest + run):
  FORETRACE_API_URL             API base URL (no trailing slash)
  FORETRACE_TOKEN               Bearer token (ft_ck_…)
  FORETRACE_ORGANIZATION_ID     Organization UUID
  FORETRACE_PROJECT_ID          Project UUID
  FORETRACE_TASK_ID             Optional task UUID

Environment (run only):
  FORETRACE_INGEST_ON           "always" (default) = ingest whenever there is captured output (success or failure)
                                "failure" = ingest only if exit code ≠ 0 (less noise on green builds)

Examples:
  npm run build 2>&1 | foretrace ingest
  foretrace run -- npm run build
  foretrace run -- pnpm test
`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runIngest(): Promise<void> {
  const env = readForetraceEnv();
  const text = await readStdin();
  const lines = linesFromOutput(text);
  if (lines.length === 0) {
    console.error('No non-empty lines on stdin');
    process.exit(1);
  }
  await postIngest(env, lines);
}

function parseRunArgv(): { cmd: string; args: string[] } {
  const argv = process.argv.slice(3);
  const dash = argv.indexOf('--');
  if (dash >= 0) {
    const rest = argv.slice(dash + 1);
    if (rest.length === 0) {
      console.error('foretrace run: expected a command after --');
      process.exit(1);
    }
    return { cmd: rest[0]!, args: rest.slice(1) };
  }
  if (argv.length === 0) {
    console.error('foretrace run: expected a command (use: foretrace run -- npm run build)');
    process.exit(1);
  }
  return { cmd: argv[0]!, args: argv.slice(1) };
}

function runSpawn(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; combined: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(cmd, args, {
      cwd,
      env: process.env,
      shell: process.platform === 'win32',
    });
    child.stdout?.on('data', (c: Buffer) => {
      process.stdout.write(c);
      chunks.push(Buffer.from(c));
    });
    child.stderr?.on('data', (c: Buffer) => {
      process.stderr.write(c);
      chunks.push(Buffer.from(c));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code,
        combined: Buffer.concat(chunks).toString('utf8'),
      });
    });
  });
}

async function runWrappedCommand(): Promise<void> {
  const env = readForetraceEnv();
  const { cmd, args } = parseRunArgv();
  const whenRaw = (process.env.FORETRACE_INGEST_ON ?? 'always')
    .toLowerCase()
    .trim();
  const mode = whenRaw === 'failure' ? 'failure' : 'always';

  const { code, combined } = await runSpawn(cmd, args, process.cwd());
  const shouldIngest =
    mode === 'always' || (mode === 'failure' && code !== 0);

  const lines = linesFromOutput(combined);
  if (shouldIngest && lines.length > 0) {
    const rev =
      code !== null && code !== 0
        ? `exit:${code}`
        : code === 0
          ? 'exit:0'
          : 'exit:unknown';
    await postIngest(
      env,
      lines,
      { revision: `${cmd} ${rev}`.slice(0, 120) },
      { quiet: true },
    );
  }

  process.exitCode = code === null ? 1 : code;
}

void main();
