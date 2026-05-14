import type { ReactNode } from 'react';
import { LayoutProvider } from './layout-context';
import { DesktopSidebar, MobileNavPanel } from './SideNavigation';
import { TopBar } from './TopBar';

function ShellBody({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.55] dark:opacity-40"
        aria-hidden
      >
        <div className="absolute inset-x-0 top-[-20%] h-[480px] bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(13,148,136,0.16),transparent)] dark:bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(45,212,191,0.09),transparent)]" />
        <div className="absolute bottom-[-30%] left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(13,148,136,0.06),transparent_65%)] dark:bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.04),transparent_65%)]" />
      </div>

      <MobileNavPanel />
      <DesktopSidebar />

      <div className="relative flex min-h-[100dvh] min-h-screen flex-1 flex-col lg:pl-[264px]">
        <TopBar />
        <div className="relative flex-1 px-3 pb-10 pt-6 sm:px-5 lg:px-10 lg:pt-10">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </div>
        <footer className="relative border-t border-zinc-200/70 px-5 py-4 text-center text-[11px] text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-600">
          Foretrace rolls up saved 24h signal snapshots on Overview; open a project for full detail and actions.
        </footer>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LayoutProvider>
      <ShellBody>{children}</ShellBody>
    </LayoutProvider>
  );
}
