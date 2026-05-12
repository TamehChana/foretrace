/**
 * Copies the packaged VSIX into apps/web/public/downloads so /docs can link to a stable URL.
 * Run from repo root (e.g. via `npm run sync-web-vsix` or the web build).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const extDir = join(root, 'extensions', 'foretrace-vscode');
const extPkgPath = join(extDir, 'package.json');
const webConstPath = join(root, 'apps', 'web', 'src', 'lib', 'foretrace-vscode-download.ts');

const extPkg = JSON.parse(readFileSync(extPkgPath, 'utf8'));
const version = extPkg.version;
const vsixName = `foretrace-vscode-${version}.vsix`;
const vsixSrc = join(extDir, vsixName);
const outDir = join(root, 'apps', 'web', 'public', 'downloads');
const vsixDst = join(outDir, vsixName);

const webConst = readFileSync(webConstPath, 'utf8');
const m = webConst.match(/FORETRACE_VSCODE_VERSION\s*=\s*'([^']+)'/);
if (!m || m[1] !== version) {
  console.error(
    `[sync-vsix-to-web-public] Bump FORETRACE_VSCODE_VERSION in apps/web/src/lib/foretrace-vscode-download.ts to '${version}' (must match extensions/foretrace-vscode/package.json).`
  );
  process.exit(1);
}

if (!existsSync(vsixSrc)) {
  console.log('[sync-vsix-to-web-public] packaging extension (missing VSIX)…');
  const r = spawnSync('npm', ['run', 'extension:package'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(vsixSrc)) {
  console.error(`[sync-vsix-to-web-public] expected VSIX at ${vsixSrc}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(vsixSrc, vsixDst);
console.log(`[sync-vsix-to-web-public] ${vsixName} → apps/web/public/downloads/`);
