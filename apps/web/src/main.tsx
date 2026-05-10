function showFatal(target: HTMLElement, message: string): void {
  target.replaceChildren();
  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:0;padding:16px;white-space:pre-wrap;font:13px/1.5 ui-monospace,Consolas,monospace;color:#3f3f46';
  pre.textContent = message;
  target.appendChild(pre);
}

async function main(): Promise<void> {
  const el = document.getElementById('root');
  if (!el) {
    showFatal(document.body, 'Fatal: missing <div id="root">.');
    return;
  }

  try {
    const { boot } = await import('./boot.tsx');
    boot(el);
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? `${err.message}\n\n${err.stack ?? ''}`
        : `Could not load the app bundle:\n${String(err)}`;
    showFatal(
      el,
      `${msg}\n\nTip: use the dev server URL (npm run dev → http://localhost:5173), not opening the HTML file directly.`,
    );
  }
}

void main();
