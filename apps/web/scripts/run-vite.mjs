#!/usr/bin/env node
/**
 * Runs the Vite CLI: prefer local workspace install, fall back to pinned npx
 * (Vercel sometimes omits hoisted tool packages after npm ci — see vercel.json install).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep in sync with resolved version in package-lock (root or apps/web). */
const PINNED_VITE = 'vite@8.0.11';

const appsWebRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function findViteBin() {
  let dir = appsWebRoot;
  for (;;) {
    const bin = join(dir, 'node_modules', 'vite', 'bin', 'vite.js');
    if (existsSync(bin)) return bin;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const args = process.argv.slice(2);
const viteBin = findViteBin();

let r;
if (viteBin) {
  r = spawnSync(process.execPath, [viteBin, ...args], {
    stdio: 'inherit',
    shell: false
  });
} else {
  console.warn(`[run-vite] local vite missing; using npx ${PINNED_VITE}`);
  r = spawnSync('npx', ['--yes', PINNED_VITE, ...args], {
    stdio: 'inherit',
    shell: true
  });
}
process.exit(r.status === null ? 1 : r.status);
