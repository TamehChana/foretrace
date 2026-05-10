#!/usr/bin/env node
/**
 * Runs the Vite CLI via Node resolution (works when hoisted above apps/web).
 * Avoids relying on PATH (tsc/vite shims), npx, or git in the outer shell.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function resolveViteBin() {
  try {
    const pkgRoot = dirname(require.resolve('vite/package.json'));
    return join(pkgRoot, 'bin', 'vite.js');
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const viteBin = resolveViteBin();

if (!viteBin) {
  console.error(
    '[run-vite] vite is not installed. Run npm ci at the repo root (see vercel.json installCommand).'
  );
  process.exit(1);
}

const r = spawnSync(process.execPath, [viteBin, ...args], {
  cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
  stdio: 'inherit',
  shell: false,
});

process.exit(r.status === null ? 1 : r.status);
