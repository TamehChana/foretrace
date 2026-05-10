'use strict';

const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

/** Resolve typescript from this package wiring (workspace / hoisted). */
function tscEntry() {
  try {
    return resolve(require.resolve('typescript/package.json'), '../lib/tsc.js');
  } catch {
    console.error('@foretrace/shared: dependency "typescript" is not installed (run npm install / npm ci)');
    process.exit(1);
  }
}

const argv = process.argv.slice(2);
const r = spawnSync(process.execPath, [tscEntry(), ...argv], {
  cwd: __dirname,
  stdio: 'inherit',
});

if (r.error) {
  console.error(r.error);
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status);
