import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SECRET_CLI_TOKEN = 'foretrace.cliToken';
const MAX_LINES = 320;
const MAX_LINE_CHARS = 12_288;
const DEFAULT_FLUSH_MS = 180_000;
const MIN_FLUSH_MS = 500;
const MAX_FLUSH_MS = 300_000;

function isWorkspaceTrusted(): boolean {
  const w = vscode.workspace as { isTrusted?: boolean };
  return w.isTrusted !== false;
}

type TerminalWriteEvent = { terminal: vscode.Terminal; data: string };

type WindowWithTerminalData = typeof vscode.window & {
  onDidWriteTerminalData?: (
    listener: (e: TerminalWriteEvent) => unknown,
    thisArgs?: unknown,
    disposables?: vscode.Disposable[],
  ) => vscode.Disposable;
};

function windowWithTerminalData(): WindowWithTerminalData {
  return vscode.window as unknown as WindowWithTerminalData;
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('foretrace');
}

function apiBaseUrl(): string {
  return getConfig().get<string>('apiBaseUrl', '').trim().replace(/\/+$/, '');
}

function organizationId(): string {
  return getConfig().get<string>('organizationId', '').trim().toLowerCase();
}

function projectId(): string {
  return getConfig().get<string>('projectId', '').trim().toLowerCase();
}

function flushIntervalMs(): number {
  const n = getConfig().get<number>('flushIntervalMs', DEFAULT_FLUSH_MS);
  if (typeof n !== 'number' || Number.isNaN(n)) {
    return DEFAULT_FLUSH_MS;
  }
  return Math.min(MAX_FLUSH_MS, Math.max(MIN_FLUSH_MS, n));
}

function autoStartTerminalCapture(): boolean {
  return getConfig().get<boolean>('autoStartTerminalCapture', false) === true;
}

/** Local transcript Cursor can write into when live terminal streaming is blocked. */
function captureLogPath(): string {
  const configured = getConfig().get<string>('captureLogPath', '').trim();
  if (configured.length > 0) {
    return configured;
  }
  return path.join(os.homedir(), '.foretrace', 'capture.log');
}

function workspaceCwd(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

function linesFromRaw(raw: string): string[] {
  const sliced = raw.length > 400_000 ? raw.slice(-400_000) : raw;
  return sliced
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .map((l) => (l.length > MAX_LINE_CHARS ? l.slice(-MAX_LINE_CHARS) : l))
    .slice(0, MAX_LINES);
}

async function resolveCliToken(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const fromSecrets = await context.secrets.get(SECRET_CLI_TOKEN);
  if (fromSecrets?.startsWith('ft_ck_')) {
    return fromSecrets.trim();
  }
  const fromSettings = getConfig().get<string>('cliToken', '').trim();
  if (fromSettings.startsWith('ft_ck_')) {
    return fromSettings;
  }
  return undefined;
}

async function postTerminalBatch(
  context: vscode.ExtensionContext,
  lines: string[],
): Promise<{ status: number; body: string }> {
  if (lines.length === 0) {
    return { status: 204, body: '' };
  }
  const base = apiBaseUrl();
  const org = organizationId();
  const proj = projectId();
  if (!base) {
    throw new Error('Set foretrace.apiBaseUrl in Settings');
  }
  if (!org) {
    throw new Error('Set foretrace.organizationId in Settings');
  }
  if (!proj) {
    throw new Error('Set foretrace.projectId in Settings');
  }
  const token = await resolveCliToken(context);
  if (!token) {
    throw new Error(
      'Set foretrace.cliToken in Settings, or run “Foretrace: Set CLI ingest token” and paste a minted ft_ck_ token',
    );
  }

  const url = `${base}/organizations/${encodeURIComponent(org)}/projects/${encodeURIComponent(proj)}/terminal/batches`;
  const payload = {
    lines,
    client: {
      host: os.hostname(),
      cwd: workspaceCwd(),
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function postInChunks(
  context: vscode.ExtensionContext,
  lines: string[],
): Promise<void> {
  for (let i = 0; i < lines.length; i += MAX_LINES) {
    const chunk = lines.slice(i, i + MAX_LINES);
    const { status, body } = await postTerminalBatch(context, chunk);
    if (status === 401 || status === 403) {
      throw new Error(`${status}: ${body}`);
    }
    if (status < 200 || status >= 300) {
      throw new Error(`Ingest failed (${status}): ${body}`);
    }
  }
}

function ensureCaptureLogFile(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf8');
  }
}

type CaptureMode = 'live' | 'file';

class TerminalCaptureSession {
  private buffer = '';
  private capturing = false;
  private mode: CaptureMode | undefined;
  private disposable: vscode.Disposable | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private fileOffset = 0;
  private logPath = '';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logLine: (message: string) => void,
  ) {}

  get isCapturing(): boolean {
    return this.capturing;
  }

  /**
   * @returns true if capture is running after this call
   */
  start(opts?: { quiet?: boolean }): boolean {
    if (this.capturing) {
      if (!opts?.quiet) {
        void vscode.window.showInformationMessage('Foretrace: capture already running');
      }
      return true;
    }

    const liveOk = this.tryStartLive();
    if (!liveOk) {
      this.startFileMode();
    }

    const intervalMs = flushIntervalMs();
    this.interval = setInterval(() => {
      void this.flush();
    }, intervalMs);
    this.capturing = true;

    const secs = Math.round(intervalMs / 1000);
    if (this.mode === 'live') {
      this.logLine(`capture started (live), flush every ${intervalMs} ms`);
      if (!opts?.quiet) {
        void vscode.window.showInformationMessage(
          `Foretrace: live terminal capture started (flush every ${secs}s)`,
        );
      }
    } else {
      this.logLine(`capture started (file), path=${this.logPath}, flush every ${intervalMs} ms`);
      if (!opts?.quiet) {
        void vscode.window
          .showInformationMessage(
            `Foretrace: Cursor blocks live terminal streaming. Using file capture → ${this.logPath}. Open a Foretrace Capture terminal.`,
            'Open capture terminal',
          )
          .then((choice) => {
            if (choice === 'Open capture terminal') {
              void vscode.commands.executeCommand('foretrace.openCaptureTerminal');
            }
          });
      }
    }
    return true;
  }

  private tryStartLive(): boolean {
    const w = windowWithTerminalData();
    if (typeof w.onDidWriteTerminalData !== 'function') {
      return false;
    }
    try {
      this.buffer = '';
      this.disposable = w.onDidWriteTerminalData((e: TerminalWriteEvent) => {
        this.buffer += e.data;
      });
      this.mode = 'live';
      return true;
    } catch (e) {
      this.logLine(
        `live capture unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
      this.disposable = undefined;
      return false;
    }
  }

  private startFileMode(): void {
    this.mode = 'file';
    this.logPath = captureLogPath();
    ensureCaptureLogFile(this.logPath);
    try {
      this.fileOffset = fs.statSync(this.logPath).size;
    } catch {
      this.fileOffset = 0;
    }
  }

  dispose(): void {
    this.capturing = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.disposable?.dispose();
    this.disposable = undefined;
    void this.flush();
    this.mode = undefined;
  }

  stop(): void {
    if (!this.capturing) {
      void vscode.window.showInformationMessage('Foretrace: capture was not running');
      return;
    }
    void vscode.window.showInformationMessage('Foretrace: terminal capture stopped');
    this.dispose();
  }

  private readNewFileChunk(): string {
    try {
      const stat = fs.statSync(this.logPath);
      if (stat.size < this.fileOffset) {
        // Log rotated / truncated
        this.fileOffset = 0;
      }
      if (stat.size === this.fileOffset) {
        return '';
      }
      const fd = fs.openSync(this.logPath, 'r');
      try {
        const len = stat.size - this.fileOffset;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, this.fileOffset);
        this.fileOffset = stat.size;
        return buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      this.logLine(`file read error: ${e instanceof Error ? e.message : String(e)}`);
      return '';
    }
  }

  private async flush(): Promise<void> {
    let raw = '';
    if (this.mode === 'live') {
      if (this.buffer.length === 0) {
        return;
      }
      raw = this.buffer;
      this.buffer = '';
    } else if (this.mode === 'file') {
      raw = this.readNewFileChunk();
    } else {
      return;
    }

    const lines = linesFromRaw(raw);
    if (lines.length === 0) {
      return;
    }
    try {
      await postInChunks(this.context, lines);
      this.logLine(`flushed ${lines.length} line(s) (${this.mode})`);
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Foretrace: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

function openCaptureTerminal(): void {
  const logFile = captureLogPath();
  ensureCaptureLogFile(logFile);
  const quoted = logFile.replace(/'/g, `'\\''`);
  // `script` records all terminal I/O into the capture log (works in Cursor without proposed APIs).
  const term = vscode.window.createTerminal({
    name: 'Foretrace Capture',
    shellPath: '/bin/zsh',
    shellArgs: [
      '-lc',
      `echo "Foretrace: recording this terminal to ${quoted}"; echo "Leave this tab open while you work."; exec script -q -a '${quoted}' /bin/zsh -l`,
    ],
  });
  term.show();
}

export function activate(context: vscode.ExtensionContext): void {
  try {
    doActivate(context);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Foretrace] activate failed', e);
    void vscode.window.showErrorMessage(`Foretrace failed to start: ${msg}`);
    throw e;
  }
}

function doActivate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Foretrace (ingest)');
  context.subscriptions.push(outputChannel);
  const logLine = (message: string): void => {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  };

  const pkg = context.extension.packageJSON as { version?: string };
  const ver = pkg.version ?? '?';
  logLine(`activate v${ver}`);

  console.info(`[Foretrace] extension activated v${ver}`);

  const session = new TerminalCaptureSession(context, logLine);

  context.subscriptions.push(
    vscode.commands.registerCommand('foretrace.setCliToken', async () => {
      logLine('setCliToken: command started');
      if (!isWorkspaceTrusted()) {
        logLine('setCliToken: blocked — workspace is Restricted (not trusted)');
        void vscode.window.showErrorMessage(
          'Foretrace: This folder is in Restricted Mode. Trust this workspace (blue banner, or Command “Workspaces: Manage Workspace Trust”), then run “Set CLI ingest token” again.',
        );
        outputChannel.show(true);
        return;
      }
      try {
        const token = await vscode.window.showInputBox({
          title: 'Foretrace CLI token',
          prompt: 'Paste the full secret from the website (starts with ft_ck_)',
          password: true,
          ignoreFocusOut: true,
        });
        if (!token?.trim()) {
          logLine('setCliToken: cancelled (empty input)');
          return;
        }
        const t = token.trim();
        if (!t.startsWith('ft_ck_')) {
          void vscode.window.showErrorMessage('Token must start with ft_ck_');
          logLine('setCliToken: rejected — token prefix invalid');
          return;
        }
        await context.secrets.store(SECRET_CLI_TOKEN, t);
        logLine('setCliToken: stored in secret storage');
        void vscode.window.showInformationMessage('Foretrace: CLI token stored securely');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        logLine(`setCliToken: error — ${msg}`);
        if (stack) {
          logLine(stack);
        }
        outputChannel.show(true);
        void vscode.window.showErrorMessage(
          `Foretrace: could not save token (${msg}). Open View → Output → channel “Foretrace (ingest)”, or run “Foretrace: Open output log”. If you see Restricted Mode, trust the workspace first.`,
        );
      }
    }),

    vscode.commands.registerCommand('foretrace.showLog', () => {
      outputChannel.show(true);
    }),

    vscode.commands.registerCommand('foretrace.sendTestBatch', async () => {
      try {
        await postInChunks(context, [
          `[foretrace-vscode] test batch at ${new Date().toISOString()}`,
        ]);
        void vscode.window.showInformationMessage('Foretrace: test batch sent');
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Foretrace: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand('foretrace.sendEditorSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage('No active editor');
        return;
      }
      const sel = editor.selection;
      let text: string;
      if (sel.isEmpty) {
        const max = 120_000;
        const doc = editor.document.getText();
        text = doc.length > max ? doc.slice(-max) : doc;
      } else {
        text = editor.document.getText(sel);
      }
      const lines = linesFromRaw(text);
      if (lines.length === 0) {
        void vscode.window.showWarningMessage('Nothing to send');
        return;
      }
      try {
        await postInChunks(context, lines);
        void vscode.window.showInformationMessage(
          `Foretrace: sent ${lines.length} line(s) from editor`,
        );
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Foretrace: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand('foretrace.startTerminalCapture', () => {
      session.start();
    }),

    vscode.commands.registerCommand('foretrace.stopTerminalCapture', () => {
      session.stop();
    }),

    vscode.commands.registerCommand('foretrace.openCaptureTerminal', () => {
      openCaptureTerminal();
    }),

    { dispose: () => session.dispose() },
  );

  void maybeAutoStartCapture(context, session, logLine);
}

async function maybeAutoStartCapture(
  context: vscode.ExtensionContext,
  session: TerminalCaptureSession,
  logLine: (message: string) => void,
): Promise<void> {
  if (!autoStartTerminalCapture()) {
    return;
  }
  if (!apiBaseUrl() || !organizationId() || !projectId()) {
    logLine(
      'autoStartTerminalCapture: skipped — set apiBaseUrl, organizationId, and projectId first',
    );
    return;
  }
  const token = await resolveCliToken(context);
  if (!token) {
    logLine(
      'autoStartTerminalCapture: skipped — set foretrace.cliToken or run “Foretrace: Set CLI ingest token”',
    );
    return;
  }
  const started = session.start({ quiet: true });
  if (started) {
    logLine(
      `autoStartTerminalCapture: started (flush every ${flushIntervalMs()} ms)`,
    );
  } else {
    logLine('autoStartTerminalCapture: failed to start');
  }
}

export function deactivate(): void {
  /* Subscriptions dispose session via Disposable above. */
}
