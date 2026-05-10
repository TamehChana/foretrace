import type { LucideIcon } from 'lucide-react';
import { Bell, FolderKanban, LayoutDashboard, Settings2 } from 'lucide-react';

export type NavItemConfig =
  | { id: string; label: string; href: string; icon: LucideIcon; disabled?: false }
  | { id: string; label: string; href: string; icon: LucideIcon; disabled: true };

export const primaryNav: NavItemConfig[] = [
  { id: 'overview', label: 'Overview', href: '/', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban },
  { id: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell },
];

export const secondaryNav: NavItemConfig[] = [
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings2 },
];
