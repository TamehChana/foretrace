import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { CreateOrganizationModal } from './components/organizations/CreateOrganizationModal.tsx';
import { RootErrorBoundary } from './RootErrorBoundary.tsx';
import { AuthSessionProvider } from './providers/AuthSessionProvider.tsx';
import { ThemeProvider } from './providers/ThemeProvider.tsx';
import { ToastProvider } from './providers/ToastProvider.tsx';
import './index.css';

function showBootError(el: HTMLElement, err: unknown): void {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  el.replaceChildren();
  const pre = document.createElement('pre');
  pre.style.cssText =
    'margin:0;padding:16px;white-space:pre-wrap;font:14px/1.5 ui-monospace,Consolas,monospace;color:#b91c1c;background:#fef2f2';
  pre.textContent = message;
  el.appendChild(pre);
}

export function boot(el: HTMLElement): void {
  try {
    el.replaceChildren();
    const root = createRoot(el);
    root.render(
      <StrictMode>
        <ThemeProvider>
          <BrowserRouter>
            <AuthSessionProvider>
              <ToastProvider>
                <RootErrorBoundary>
                  <App />
                </RootErrorBoundary>
                <AuthModal />
                <CreateOrganizationModal />
              </ToastProvider>
            </AuthSessionProvider>
          </BrowserRouter>
        </ThemeProvider>
      </StrictMode>,
    );
  } catch (err: unknown) {
    showBootError(el, err);
  }
}
