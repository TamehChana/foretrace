# Foretrace VS Code extension (MVP)

Sends terminal or editor text to your Foretrace API (`POST …/terminal/batches`) using a **CLI ingest token** (`ft_ck_…`).

The packaged VSIX does **not** declare `enabledApiProposals`, so activation works in **Cursor** and stable VS Code. **Start terminal capture** still uses the stream API only when the editor exposes it at runtime.

## Setup

1. **Settings → Extensions → Foretrace** (or JSON settings) and set:
   - `foretrace.apiBaseUrl` — e.g. `https://your-api.onrender.com` (no trailing slash)
   - `foretrace.organizationId` — org UUID
   - `foretrace.projectId` — project UUID (must match where you minted the token)
2. Command palette → **Foretrace: Set CLI ingest token** — paste `ft_ck_…` from Foretrace → Project → CLI ingest tokens.
3. **Foretrace: Send test batch** — verifies connectivity.

## Terminal streaming

- **Foretrace: Start terminal capture** — listens to integrated terminal output (requires editor support for `terminalDataWriteEvent` proposed API) and POSTs lines on a timer (`foretrace.flushIntervalMs`, default 2000 ms).
- **Foretrace: Stop terminal capture** — stops listening and flushes any pending buffer.

If capture start warns that the API is missing, use **Foretrace: Send editor selection** (or CLI / CI) instead.

## Troubleshooting (Cursor)

Cursor is based on VS Code but **lags or diverges** on the extension host. **0.1.7+** uses a normal **`engines.vscode` range** (`^1.74.0`), explicit **`activationEvents`** (including **`onStartupFinished`** so the extension loads early in Cursor), and **no `extensionKind`** — some Cursor builds reject `engines: *`, missing `activationEvents`, or custom `extensionKind` at **VSIX install** time.

- If **installing the `.vsix` in Cursor** fails with a generic error, try **`foretrace-vscode-0.1.7+`**: the manifest uses a normal **`engines.vscode` range** (not `*`) and **no `extensionKind`** — some Cursor builds reject looser manifests at install time.
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
