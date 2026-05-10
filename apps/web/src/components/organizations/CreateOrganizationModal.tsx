import { Loader2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { apiFetch } from '../../api-fetch';
import { useAuthSession } from '../../providers/AuthSessionProvider';

export function CreateOrganizationModal() {
  const {
    createOrgModalOpen,
    closeCreateOrganizationModal,
    bumpWorkspaceList,
  } = useAuthSession();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!createOrgModalOpen) {
    return null;
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);

    const body: { name: string; slug?: string } = {
      name: name.trim(),
    };
    const slugTrim = slug.trim().toLowerCase();
    if (slugTrim.length >= 2) {
      body.slug = slugTrim;
    }

    try {
      const res = await apiFetch('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        let detail = `Could not create workspace (HTTP ${res.status})`;
        if (json && typeof json === 'object' && 'message' in json) {
          const m = (json as { message: unknown }).message;
          if (typeof m === 'string') {
            detail = m;
          } else if (
            Array.isArray(m) &&
            m.every((item) => typeof item === 'string')
          ) {
            detail = m.join(', ');
          }
        }
        setError(detail);
        setPending(false);
        return;
      }

      setName('');
      setSlug('');
      bumpWorkspaceList();
      closeCreateOrganizationModal();
    } catch {
      setError('Network error.');
    } finally {
      setPending(false);
    }
  }

  function onClose(): void {
    if (!pending) {
      setError(null);
      closeCreateOrganizationModal();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-org-title"
        className="animate-rise relative z-10 w-full max-w-md rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2
          id="create-org-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          New organization
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          You become <span className="font-semibold text-zinc-700 dark:text-zinc-200">ADMIN</span>{' '}
          for this workspace. Slug is optional and must be unique when set.
        </p>

        <form onSubmit={(ev) => void submit(ev)} className="mt-5 space-y-3">
          <label className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            Workspace name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="Acme Engineering"
              maxLength={160}
              autoComplete="organization"
            />
          </label>
          <label className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            Slug{' '}
            <span className="font-normal text-zinc-400 dark:text-zinc-500">
              (optional · min 2 chars · a–z, digits, hyphens)
            </span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="acme-eng"
              maxLength={64}
            />
          </label>

          {error ? (
            <p className="text-[13px] font-medium text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || name.trim().length === 0}
              className="inline-flex flex-1 min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-[transform,opacity] hover:bg-accent-500 disabled:pointer-events-none disabled:opacity-60 dark:bg-accent-500 dark:hover:bg-accent-400"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Create
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
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
