#!/usr/bin/env node
/**
 * Runs the workspace-installed Vite CLI. Avoids createRequire/require.resolve —
 * npm workspace + Node 24 on Vercel can fail to resolve `vite` from package.json.
 * Walks up to repo root searching node_modules/vite/bin/vite.js (hoisted layout).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appsWebRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function findViteBin() {
  let dir = appsWebRoot;
  for (;;) {
    const bin = join(dir, 'node_modules', 'vite', 'bin', 'vite.js');
    if (existsSync(bin)) return bin;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not find node_modules/vite/bin/vite.js from ${appsWebRoot}. ` +
      'Run npm install from the monorepo root.'
  );
}

const viteBin = findViteBin();
const args = process.argv.slice(2);
const r = spawnSync(process.execPath, [viteBin, ...args], {
  stdio: 'inherit',
  shell: false
});
process.exit(r.status === null ? 1 : r.status);
