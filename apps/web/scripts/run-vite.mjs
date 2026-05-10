#!/usr/bin/env node
/**
 * Runs the workspace-installed Vite CLI regardless of npm hoisting
 * (root vs apps/web node_modules). Used by build/preview on CI.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vitePkg = require.resolve('vite/package.json');
const viteBin = join(dirname(vitePkg), 'bin', 'vite.js');
const args = process.argv.slice(2);
const r = spawnSync(process.execPath, [viteBin, ...args], {
  stdio: 'inherit',
  shell: false
});
process.exit(r.status === null ? 1 : r.status);
