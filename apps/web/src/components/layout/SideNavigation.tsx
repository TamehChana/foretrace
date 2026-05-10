import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { useLayoutShell } from './layout-context';
import { LogoMark } from './LogoMark';
import { primaryNav, secondaryNav, type NavItemConfig } from './nav-config';

function NavBlock({
  items,
  heading,
  onNavigate,
}: {
  items: NavItemConfig[];
  heading: string;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {heading}
      </p>
      <ul className="flex flex-col gap-px" role="list">
        {items.map((item) => (
          <li key={item.id}>
            <NavRow item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavRow({ item, onNavigate }: { item: NavItemConfig; onNavigate?: () => void }) {
  const Icon = item.icon;
  const pill = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/70 transition-[background-color,box-shadow,color] group-hover:bg-accent-500/12 group-hover:text-accent-800 group-hover:ring-accent-300/40 dark:bg-zinc-800/80 dark:text-zinc-400 dark:ring-zinc-700/80 dark:group-hover:bg-accent-500/15 dark:group-hover:text-accent-200 dark:group-hover:ring-accent-600/40">
        <Icon size={18} strokeWidth={2} aria-hidden />
      </span>
      <span className="truncate font-medium">{item.label}</span>
    </>
  );

  if (item.disabled) {
    return (
      <span
        title="Coming soon"
        className="group flex cursor-not-allowed items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-zinc-400 dark:text-zinc-600"
      >
        {pill}
      </span>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950',
      isActive
        ? 'bg-accent-500/14 text-accent-900 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.18)] dark:bg-accent-500/12 dark:text-accent-50 dark:shadow-[inset_0_0_0_1px_rgba(45,212,191,0.2)]'
        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100',
    ].join(' ');

  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      className={linkClass}
      onClick={() => onNavigate?.()}
    >
      {pill}
    </NavLink>
  );
}

function SidebarChrome({
  children,
  headerTrailing,
}: {
  children: ReactNode;
  headerTrailing?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-zinc-200/80 px-4 dark:border-zinc-800/80">
        <LogoMark className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Foretrace
          </p>
          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">Delivery workspace</p>
        </div>
        {headerTrailing}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-4 ft-scrollbar">
        <div className="mb-6 flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Environment</span>
          <span className="rounded-md bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Local
          </span>
        </div>
        {children}
      </div>
      <div className="shrink-0 border-t border-zinc-200/80 p-3 dark:border-zinc-800/80">
        <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          v0.1 · Early access UI. Auth, tasks, and GitHub sync ship next.
        </p>
      </div>
    </div>
  );
}

export function DesktopSidebar() {
  return (
    <aside
      className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[264px] lg:flex-col border-r border-zinc-200/70 bg-white/92 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/92"
      aria-label="Workspace"
    >
      <SidebarChrome>
        <nav className="flex flex-col gap-6" aria-label="Primary">
          <NavBlock items={primaryNav} heading="Navigate" />
          <NavBlock items={secondaryNav} heading="Configure" />
        </nav>
      </SidebarChrome>
    </aside>
  );
}

export function MobileNavPanel() {
  const { mobileNavOpen, closeMobileNav } = useLayoutShell();
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(mobileNavOpen, dialogRef);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const id = window.setTimeout(() => {
      initialFocusRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [mobileNavOpen]);

  if (!mobileNavOpen) {
    return null;
  }

  const closeButton = (
    <button
      ref={initialFocusRef}
      type="button"
      onClick={closeMobileNav}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-600 shadow-sm transition-[box-shadow,transform] hover:border-zinc-300 hover:shadow-md active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600"
      aria-label="Close navigation"
    >
      <X size={20} strokeWidth={2} aria-hidden />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        tabIndex={-1}
        className="ft-backdrop absolute inset-0 z-0 bg-zinc-950/45 backdrop-blur-[2px]"
        onClick={closeMobileNav}
        aria-label="Dismiss menu"
      />
      <div
        id="mobile-nav-dialog"
        ref={dialogRef}
        className="mobile-nav-panel absolute inset-y-0 left-0 z-10 flex w-[min(292px,calc(100vw-40px))] flex-col border-r border-zinc-200/80 bg-white shadow-[8px_0_40px_-12px_rgba(15,23,42,0.35)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[8px_0_48px_-12px_rgba(0,0,0,0.85)]"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <SidebarChrome headerTrailing={closeButton}>
          <nav className="flex flex-col gap-6" aria-label="Primary">
            <NavBlock items={primaryNav} heading="Navigate" onNavigate={closeMobileNav} />
            <NavBlock items={secondaryNav} heading="Configure" onNavigate={closeMobileNav} />
          </nav>
        </SidebarChrome>
      </div>
    </div>
  );
}
