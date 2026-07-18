# Foretrace VS Code extension (MVP)

Sends terminal or editor text to your Foretrace API (`POST …/terminal/batches`) using a **CLI ingest token** (`ft_ck_…`).

The VSIX declares `enabledApiProposals: ["terminalDataWriteEvent"]` so the extension can register for terminal output. **Stable VS Code** still requires launching with `--enable-proposed-api foretrace.foretrace-vscode` (or using Insiders) for that API to be allowed at runtime.

## Setup

1. **Settings → Extensions → Foretrace** (or JSON settings) and set:
   - `foretrace.apiBaseUrl` — e.g. `https://foretrace-api-nwg8.onrender.com` (no trailing slash)
   - `foretrace.organizationId` — org UUID
   - `foretrace.projectId` — project UUID (must match where you minted the token)
   - `foretrace.flushIntervalMs` — how often to POST while capture is running (**default `180000` = 3 minutes**; max `300000` = 5 minutes)
   - `foretrace.autoStartTerminalCapture` — optional; when `true`, starts capture on activate if settings + token are already set
2. Command palette → **Foretrace: Set CLI ingest token** — paste `ft_ck_…` from Foretrace → Project → CLI ingest tokens.
3. **Foretrace: Send test batch** — verifies connectivity.

### Hosted example (settings.json)

```json
{
  "foretrace.apiBaseUrl": "https://foretrace-api-nwg8.onrender.com",
  "foretrace.organizationId": "<org-uuid>",
  "foretrace.projectId": "<project-uuid>",
  "foretrace.flushIntervalMs": 180000,
  "foretrace.autoStartTerminalCapture": true
}
```

Use `300000` instead of `180000` if you prefer a **5-minute** flush.

## Terminal streaming

Terminal capture uses the **proposed** `terminalDataWriteEvent` API. Your extension manifest **must** list it under `enabledApiProposals` (included in this VSIX).

While capture is running, output from **all integrated terminals** is buffered and POSTed on the flush timer (only when the buffer is non-empty).

### VS Code (stable)

If you see an error that the extension **cannot** use `terminalDataWriteEvent`, start VS Code with the API enabled for this extension id (`foretrace.foretrace-vscode`):

**Windows (Command Prompt or Run dialog, adjust path if yours differs):**

```bat
"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe" --enable-proposed-api foretrace.foretrace-vscode
```

**macOS:**

```bash
code --enable-proposed-api foretrace.foretrace-vscode
```

Or use **VS Code Insiders**, where proposed APIs used by extensions are often available without the flag (behavior can change by release).

### After it works

- **Foretrace: Start terminal capture** — listens to integrated terminal output and POSTs lines on a timer (`foretrace.flushIntervalMs`, default **3 minutes**).
- **Foretrace: Stop terminal capture** — stops listening and flushes any pending buffer.
- Enable **`foretrace.autoStartTerminalCapture`** so capture starts when the extension activates (after token + IDs are configured).

If capture still cannot start, use **Foretrace: Send editor selection** (or CLI / CI) instead.

### Cursor

Cursor may still block or differ on proposed APIs; if **Start terminal capture** fails there, use **VS Code** with the flag above, or use **editor selection** / **CLI**.

## Troubleshooting (Cursor)

Cursor is based on VS Code but **lags or diverges** on the extension host. **0.1.9+** uses a normal **`engines.vscode` range** (`^1.74.0`), explicit **`activationEvents`** (including **`onStartupFinished`** so the extension loads early in Cursor), **`enabledApiProposals`** for terminal capture, and **no `extensionKind`** — some Cursor builds reject `engines: *`, missing `activationEvents`, or custom `extensionKind` at **VSIX install** time.

- If **installing the `.vsix` in Cursor** fails with a generic error, try **`foretrace-vscode-0.1.9+`**: the manifest uses a normal **`engines.vscode` range** (not `*`) and **no `extensionKind`** — some Cursor builds reject looser manifests at install time.
- If **Set CLI ingest token** fails for policy reasons, the folder may be **Restricted / not trusted** — trust the workspace (**Workspaces: Manage Workspace Trust**), reload, try again.
- **View → Output** → **Foretrace (ingest)** — activation and token steps. Command palette → **Foretrace: Open output log** opens that channel.
- If it **still** fails only in Cursor, use **VS Code** for this extension until Cursor matches a newer VS Code base, or update Cursor to the latest stable.

## Package VSIX

From the **monorepo root** (recommended):

```bash
npm install --include=dev
npm run extension:package
```

This runs `vsce` and writes `extensions/foretrace-vscode/foretrace-vscode-<version>.vsix` (version follows `package.json`).

Alternatively, from this folder after root `npm install --include=dev`: `npm run package`.

Install the generated `.vsix` in VS Code / Cursor: **Extensions → … → Install from VSIX…**.
