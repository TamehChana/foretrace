/**
 * Must match `extensions/foretrace-vscode/package.json` `version` after each extension release.
 * `scripts/sync-vsix-to-web-public.mjs` exits with an error if these diverge.
 */
export const FORETRACE_VSCODE_VERSION = '0.1.4';

export const FORETRACE_VSCODE_FILENAME = `foretrace-vscode-${FORETRACE_VSCODE_VERSION}.vsix` as const;

export const FORETRACE_VSCODE_DOWNLOAD_PATH = `/downloads/${FORETRACE_VSCODE_FILENAME}` as const;
