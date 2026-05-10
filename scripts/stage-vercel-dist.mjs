#!/usr/bin/env node
/**
 * Copies the Vite static bundle to repo-root dist/ for Vercel Turbo layouts
 * that expect ./dist. Repo root comes from this file's location (not cwd).
 */
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootDist = join(repoRoot, 'dist');
const webDist = join(repoRoot, 'apps/web/dist');

function hasArtifact(dir) {
  return existsSync(join(dir, 'index.html'));
}

if (hasArtifact(webDist)) {
  rmSync(rootDist, { recursive: true, force: true });
  cpSync(webDist, rootDist, { recursive: true });
  console.error('[stage-vercel-dist]', webDist, '->', rootDist);
  process.exit(0);
}

if (hasArtifact(rootDist)) {
  console.error('[stage-vercel-dist] OK (root only)', rootDist);
  process.exit(0);
}

console.error('[stage-vercel-dist] Missing index.html under', webDist, 'and', rootDist);
console.error('[stage-vercel-dist] repoRoot=', repoRoot);
try {
  console.error('[stage-vercel-dist] top-level:', readdirSync(repoRoot));
} catch {}
try {
  console.error('[stage-vercel-dist] apps/web:', readdirSync(join(repoRoot, 'apps/web')));
} catch (e) {
  console.error('[stage-vercel-dist] apps/web:', e.message);
}
process.exit(1);
