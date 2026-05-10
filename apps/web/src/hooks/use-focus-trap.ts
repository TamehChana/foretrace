import { type RefObject, useEffect } from 'react';

const TABBABLE =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

function listTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    if (el.hasAttribute('disabled')) {
      return false;
    }
    if (el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    return el.closest('[aria-hidden="true"]') === null;
  });
}

/** Keeps Tab / Shift+Tab cycling inside `containerRef` while `active`. */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active || !containerRef.current) {
      return;
    }
    const container = containerRef.current;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') {
        return;
      }
      const nodes = listTabbables(container);
      if (nodes.length === 0) {
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef]);
}
