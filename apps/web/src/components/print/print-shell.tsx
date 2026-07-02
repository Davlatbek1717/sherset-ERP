'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export interface PrintShellProps {
  /** Auto-fire window.print() on mount once content is ready. */
  autoPrint?: boolean;
  children: React.ReactNode;
}

/**
 * Print page wrapper:
 * - Top-right toolbar (visible on screen, hidden when printing) with
 *   Print + Close buttons.
 * - Optional auto-print on mount — useful when the print page is
 *   opened in a popup window.
 */
export function PrintShell({ autoPrint = false, children }: PrintShellProps) {
  const t = useTranslations('pages.print');

  useEffect(() => {
    if (!autoPrint) return;
    // Small delay so React Query data + fonts have a chance to render
    // before the browser snapshots the print preview.
    const id = setTimeout(() => window.print(), 600);
    return () => clearTimeout(id);
  }, [autoPrint]);

  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={() => window.print()} data-test-id="print-button">
          {t('print_button')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (window.opener) window.close();
            else window.history.back();
          }}
          data-test-id="close-button"
        >
          {t('close_button')}
        </button>
      </div>
      <div className="print-page">{children}</div>
    </>
  );
}
