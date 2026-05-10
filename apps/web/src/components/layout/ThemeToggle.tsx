import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../providers/ThemeProvider';

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className="flex rounded-lg border border-zinc-200/80 bg-zinc-50/80 p-0.5 dark:border-zinc-700/80 dark:bg-zinc-900/60"
      role="group"
      aria-label="Color theme"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setPreference(value)}
          title={label}
          aria-label={label}
          aria-pressed={preference === value}
          className={
            preference === value
              ? 'rounded-md bg-white px-2 py-1.5 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:ring-zinc-600'
              : 'rounded-md px-2 py-1.5 text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
          }
        >
          <Icon size={15} strokeWidth={2} className="block" aria-hidden />
        </button>
      ))}
    </div>
  );
}
