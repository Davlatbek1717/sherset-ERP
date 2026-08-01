'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export interface ThermalShellProps {
  /** Thermal paper width in mm (Xprinter: 80 or 58). */
  widthMm?: number;
  /** Auto-fire window.print() on mount (popup print flow). */
  autoPrint?: boolean;
  children: React.ReactNode;
}

/**
 * Print wrapper for THERMAL (Xprinter) receipts — true `@page { size: Nmm auto }`
 * geometry so the job prints on a 58/80mm continuous strip, NOT A4. Sets the
 * page width in mm (content sized in mm fits exactly), zero page margin (thermal
 * printers handle their own edge), and neutralises the A4 `.print-root` /
 * `.print-page` rules from print.css. Children opt into per-strip cuts with
 * `className="thermal-cut"` (page-break-after). Mirrors PrintShell's toolbar.
 *
 * The injected <style> is rendered after the layout's print.css, so its unnamed
 * `@page` overrides the global A4 one (later declaration wins per property) —
 * same proven trick as /labels/print.
 */
export function ThermalShell({ widthMm = 80, autoPrint = false, children }: ThermalShellProps) {
  const t = useTranslations('pages.print');

  useEffect(() => {
    if (!autoPrint) return;
    const id = setTimeout(() => window.print(), 600);
    return () => clearTimeout(id);
  }, [autoPrint]);

  return (
    <>
      <style>{`
        @media print {
          @page { size: ${widthMm}mm auto; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff; }
          .print-root { padding: 0 !important; display: block !important; }
          .thermal-sheet { box-shadow: none !important; margin: 0 !important; width: ${widthMm}mm !important; }
          .thermal-cut { page-break-after: always; }
          .thermal-cut:last-child { page-break-after: auto; }
        }
      `}</style>

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

      <div
        className="thermal-sheet"
        style={{
          width: `${widthMm}mm`,
          margin: '0 auto',
          background: '#fff',
          color: '#000',
          boxShadow: '0 0 0 1px #e5e7eb',
          fontFamily: '"Courier New", monospace',
        }}
      >
        {children}
      </div>
    </>
  );
}
