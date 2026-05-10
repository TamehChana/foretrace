import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const src = join('apps', 'web', 'dist');
const dst = 'dist';

if (!existsSync(src)) {
  console.error(`[sync-web-dist-root] missing ${src} — run the web build first`);
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log(`[sync-web-dist-root] copied ${src} → ${dst}`);
