import { Bell, Loader2, LogOut, Menu, Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthSession } from '../../providers/AuthSessionProvider';
import { MOBILE_NAV_OPEN_BUTTON_ID, useLayoutShell } from './layout-context';
import { ThemeToggle } from './ThemeToggle';

function breadcrumbForPath(pathname: string): { section: string; page: string } {
  if (pathname === '/projects') {
    return { section: 'Projects', page: 'Directory' };
  }
  if (pathname === '/alerts') {
    return { section: 'Alerts', page: 'Inbox' };
  }
  if (pathname === '/settings') {
    return { section: 'Settings', page: 'Workspace' };
  }
  if (pathname === '/' || pathname === '') {
    return { section: 'Overview', page: 'Dashboard' };
  }
  return { section: 'Page', page: 'Not found' };
}

export function TopBar() {
  const { setMobileNavOpen, mobileNavOpen } = useLayoutShell();
  const { pathname } = useLocation();
  const { section, page } = breadcrumbForPath(pathname);
  const { snapshot, openAuthModal, logout } = useAuthSession();

  const sessionLoading = snapshot.status === 'loading';
  const signedInUser = snapshot.status === 'ready' ? snapshot.user : null;
  const avatarLetter = (
    signedInUser?.displayName?.trim()?.[0] ??
    signedInUser?.email?.[0] ??
    '?'
  ).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200/80 bg-white/80 px-3 backdrop-blur-xl sm:px-5 dark:border-zinc-800/80 dark:bg-zinc-950/75">
      <button
        id={MOBILE_NAV_OPEN_BUTTON_ID}
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-700 shadow-sm transition-[box-shadow,transform] hover:border-zinc-300 hover:shadow-md active:scale-[0.98] lg:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
        aria-label="Open navigation"
        aria-expanded={mobileNavOpen}
        aria-controls="mobile-nav-dialog"
      >
        <Menu size={20} strokeWidth={2} aria-hidden />
      </button>

      <div className="hidden min-w-0 items-center gap-1.5 text-sm text-zinc-500 lg:flex dark:text-zinc-400">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{section}</span>
        <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
          /
        </span>
        <span>{page}</span>
      </div>

      <div className="relative hidden min-w-0 flex-1 md:block md:max-w-md md:px-2 lg:max-w-lg">
        <button
          type="button"
          disabled
          title="Command palette after authentication"
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50/90 py-2 pl-3 pr-3 text-left text-sm text-zinc-400 shadow-inner dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-500"
        >
          <Search size={17} className="shrink-0 opacity-70" aria-hidden />
          <span className="truncate">Search projects, tasks, people…</span>
          <kbd className="ml-auto hidden shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400 sm:inline-block dark:border-zinc-700 dark:bg-zinc-800">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled
          title="Notifications · coming soon"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-zinc-400 cursor-not-allowed dark:text-zinc-600"
          aria-label="Notifications (coming soon)"
        >
          <Bell size={18} strokeWidth={2} aria-hidden />
        </button>
        <ThemeToggle />
        {!sessionLoading && signedInUser ? (
          <button
            type="button"
            onClick={() => void logout()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/90 text-zinc-600 transition-colors hover:bg-zinc-100 sm:hidden dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Sign out"
          >
            <LogOut size={17} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        {!sessionLoading && !signedInUser ? (
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-800 shadow-sm sm:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            Sign in
          </button>
        ) : null}
        {sessionLoading ? (
          <span
            className="flex h-9 w-9 items-center justify-center text-zinc-400 dark:text-zinc-500"
            aria-label="Loading session"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </span>
        ) : signedInUser ? (
          <>
            <button
              type="button"
              onClick={() => void logout()}
              className="hidden h-9 items-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition-[box-shadow,transform] hover:border-zinc-300 hover:shadow sm:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
            >
              Sign out
            </button>
            <span
              className="flex h-9 max-w-[7rem] items-center truncate rounded-full border border-zinc-200/90 bg-zinc-50 px-2.5 text-[11px] font-medium text-zinc-700 shadow-inner dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300"
              title={signedInUser.email}
              aria-live="polite"
            >
              {signedInUser.email}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="hidden h-9 items-center rounded-full border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 px-3 text-xs font-semibold text-zinc-800 shadow-sm transition-[box-shadow,transform] hover:border-accent-400/55 hover:shadow-md sm:inline-flex dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950 dark:text-zinc-100"
          >
            Sign in
          </button>
        )}
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-[11px] font-bold uppercase text-white shadow-md ring-2 ring-white dark:ring-zinc-950"
          aria-hidden={!signedInUser}
          aria-label={signedInUser ? 'Account avatar' : undefined}
        >
          {avatarLetter}
        </span>
      </div>
    </header>
  );
}
