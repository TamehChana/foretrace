/**
 * Runs shared + web build and mirrors apps/web/dist → repo-root dist.
 * Resolved via import.meta.url so it works regardless of process.cwd()
 * (Vercel may use Root Directory apps/* where cwd ≠ monorepo root).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...opts,
  });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  const code = r.status === null ? 1 : r.status;
  if (code !== 0) process.exit(code);
}

run('npm', ['run', 'build', '-w', '@foretrace/shared'], {
  shell: process.platform === 'win32',
});
run('npm', ['run', 'sync-web-vsix'], {
  shell: process.platform === 'win32',
});
run('npm', ['run', 'build', '-w', '@foretrace/web'], {
  shell: process.platform === 'win32',
});
run(process.execPath, [join(scriptDir, 'sync-web-dist-root.mjs')]);
