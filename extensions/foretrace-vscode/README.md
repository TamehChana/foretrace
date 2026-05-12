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

## Package VSIX

From the **monorepo root** (recommended):

```bash
npm install --include=dev
npm run extension:package
```

This runs `vsce` and writes `extensions/foretrace-vscode/foretrace-vscode-<version>.vsix` (version follows `package.json`).

Alternatively, from this folder after root `npm install --include=dev`: `npm run package`.

Install the generated `.vsix` in VS Code / Cursor: **Extensions → … → Install from VSIX…**.
