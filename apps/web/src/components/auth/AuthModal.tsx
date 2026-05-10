import { Loader2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiFetch } from '../../api-fetch';
import { useAuthSession } from '../../providers/AuthSessionProvider';

type Mode = 'signin' | 'register';

type SessionEnvelope = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
};

export function AuthModal() {
  const { authModalOpen, closeAuthModal, refresh } = useAuthSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!authModalOpen) {
    return null;
  }

  function resetTransient(): void {
    setError(null);
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setPending(true);
    try {
      const path = mode === 'signin' ? '/auth/login' : '/auth/register';
      const body =
        mode === 'signin'
          ? { email: email.trim(), password }
          : {
              email: email.trim(),
              password,
              displayName: displayName.trim() || undefined,
            };

      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const fallback = `Could not ${mode === 'signin' ? 'sign in' : 'register'} (HTTP ${res.status})`;
        let detail = fallback;
        if (json && typeof json === 'object' && 'message' in json) {
          const m = (json as { message: unknown }).message;
          if (typeof m === 'string') {
            detail = m;
          } else if (Array.isArray(m) && m.every((item) => typeof item === 'string')) {
            detail = m.join(', ');
          }
        }
        setError(detail);
        setPending(false);
        return;
      }

      const user = json as Partial<SessionEnvelope> | null;
      if (!user?.user?.id) {
        setError('Unexpected response from server.');
        setPending(false);
        return;
      }

      await refresh();
      setPassword('');
      setConfirmPassword('');
      closeAuthModal();
    } catch {
      setError('Network error.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => !pending && closeAuthModal()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="animate-rise relative z-10 w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="auth-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          Email + password. Sessions use HTTP-only cookies (see SRS security notes).
        </p>

        <div className="mt-5 flex rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-950/80">
          <button
            type="button"
            aria-pressed={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setConfirmPassword('');
              resetTransient();
            }}
            className={`flex-1 rounded-lg py-2 transition-colors ${mode === 'signin' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50' : 'text-zinc-500 dark:text-zinc-400'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === 'register'}
            onClick={() => {
              setMode('register');
              setConfirmPassword('');
              resetTransient();
            }}
            className={`flex-1 rounded-lg py-2 transition-colors ${mode === 'register' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50' : 'text-zinc-500 dark:text-zinc-400'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
          {mode === 'register' ? (
            <label className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
              Display name{' '}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="Jamie Rivera"
                autoComplete="nickname"
              />
            </label>
          ) : null}
          <label className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="you@organization.com"
              autoComplete="email"
            />
          </label>
          <label className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            Password
            <span className="ml-1 font-normal text-zinc-400 dark:text-zinc-500">
              ({mode === 'register' ? 'min 8 characters' : 'your password'})
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={mode === 'register' ? 8 : undefined}
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
          {mode === 'register' ? (
            <label className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
              Confirm password
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="Re-enter password"
                autoComplete="new-password"
                aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
              />
            </label>
          ) : null}

          {error ? (
            <p className="text-[13px] font-medium text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex flex-1 min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-[transform,opacity] hover:bg-accent-500 disabled:pointer-events-none disabled:opacity-60 dark:bg-accent-500 dark:hover:bg-accent-400"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {mode === 'signin' ? 'Sign in' : 'Register'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={closeAuthModal}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
