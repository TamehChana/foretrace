import type { LucideIcon } from 'lucide-react';
import { Bell, BookOpen, FolderKanban, LayoutDashboard, Settings2 } from 'lucide-react';

export type NavItemConfig =
  | { id: string; label: string; href: string; icon: LucideIcon; disabled?: false }
  | { id: string; label: string; href: string; icon: LucideIcon; disabled: true };

export const primaryNav: NavItemConfig[] = [
  { id: 'overview', label: 'Overview', href: '/', icon: LayoutDashboard },
  { id: 'docs', label: 'Setup guide', href: '/docs', icon: BookOpen },
  { id: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban },
  { id: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell },
];

export const secondaryNav: NavItemConfig[] = [
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings2 },
];
