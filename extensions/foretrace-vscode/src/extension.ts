import * as vscode from 'vscode';
import * as os from 'node:os';

const SECRET_CLI_TOKEN = 'foretrace.cliToken';
const MAX_LINES = 320;
const MAX_LINE_CHARS = 12_288;

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
  const n = getConfig().get<number>('flushIntervalMs', 2000);
  if (typeof n !== 'number' || Number.isNaN(n)) {
    return 2000;
  }
  return Math.min(60_000, Math.max(500, n));
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
  const token = await context.secrets.get(SECRET_CLI_TOKEN);
  if (!token || !token.startsWith('ft_ck_')) {
    throw new Error('Run “Foretrace: Set CLI token” and paste a minted ft_ck_ token');
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

class TerminalCaptureSession {
  private buffer = '';
  private capturing = false;
  private disposable: vscode.Disposable | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  start(): void {
    if (this.capturing) {
      void vscode.window.showInformationMessage('Foretrace: capture already running');
      return;
    }
    const w = windowWithTerminalData();
    if (typeof w.onDidWriteTerminalData !== 'function') {
      void vscode.window.showWarningMessage(
        'Foretrace: this editor build does not expose terminalDataWriteEvent. Use VS Code ≥1.85 with proposed API enabled for this extension, or use the CLI / CI path.',
      );
      return;
    }
    this.capturing = true;
    this.buffer = '';
    this.disposable = w.onDidWriteTerminalData((e: TerminalWriteEvent) => {
      this.buffer += e.data;
    });
    this.interval = setInterval(() => {
      void this.flush();
    }, flushIntervalMs());
    void vscode.window.showInformationMessage('Foretrace: terminal capture started');
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
  }

  stop(): void {
    if (!this.capturing) {
      void vscode.window.showInformationMessage('Foretrace: capture was not running');
      return;
    }
    void vscode.window.showInformationMessage('Foretrace: terminal capture stopped');
    this.dispose();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }
    const raw = this.buffer;
    this.buffer = '';
    const lines = linesFromRaw(raw);
    if (lines.length === 0) {
      return;
    }
    try {
      await postInChunks(this.context, lines);
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Foretrace: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const session = new TerminalCaptureSession(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('foretrace.setCliToken', async () => {
      const token = await vscode.window.showInputBox({
        title: 'Foretrace CLI token',
        prompt: 'Paste ft_ck_… (minted in Foretrace → project → CLI ingest tokens)',
        password: true,
        ignoreFocusOut: true,
      });
      if (!token?.trim()) {
        return;
      }
      const t = token.trim();
      if (!t.startsWith('ft_ck_')) {
        void vscode.window.showErrorMessage('Token must start with ft_ck_');
        return;
      }
      await context.secrets.store(SECRET_CLI_TOKEN, t);
      void vscode.window.showInformationMessage('Foretrace: CLI token stored securely');
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

    { dispose: () => session.dispose() },
  );
}

export function deactivate(): void {
  /* Subscriptions dispose session via Disposable above. */
}
