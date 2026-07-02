'use client';

import { Button, DropdownMenu, Icons } from '@moysklad/ui';

interface Props {
  /** Called when user picks "Скопировать" — should clone the doc and navigate to it. */
  onClone: () => void;
  /** Pdf download URL — typically `/print/{slug}/{id}?auto=1&format=pdf`.
   *  If omitted, the "Скачать PDF" item is hidden (use for doc types without
   *  a print route yet). */
  pdfUrl?: string;
  /** Optional extra slot rendered at the top, before the standard items. */
  prefix?: React.ReactNode;
}

/**
 * Standard "···" menu used on every document detail page (customer-order,
 * invoice-out, demand, supply, payment, ...). Mirrors moysklad's More menu:
 *   1. Скопировать — duplicate as fresh draft
 *   2. Скопировать ссылку — copy current URL to clipboard
 *   3. (separator)
 *   4. Скачать PDF — open the printable view in PDF mode
 */
export function DocumentMoreMenu({ onClone, pdfUrl, prefix }: Props) {
  return (
    <DropdownMenu
      align="end"
      testId="more-menu"
      trigger={
        <Button variant="tertiary" size="icon-sm" aria-label="More actions">
          <Icons.more className="h-4 w-4" />
        </Button>
      }
    >
      {prefix}
      <DropdownMenu.Item
        icon={<Icons.copy className="h-4 w-4" />}
        onSelect={onClone}
        testId="more-clone"
      >
        Скопировать
      </DropdownMenu.Item>
      <DropdownMenu.Item
        icon={<Icons.link className="h-4 w-4" />}
        onSelect={() => {
          navigator.clipboard.writeText(window.location.href).catch(() => undefined);
        }}
        testId="more-copy-link"
      >
        Скопировать ссылку
      </DropdownMenu.Item>
      {pdfUrl && (
        <>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            icon={<Icons.download className="h-4 w-4" />}
            onSelect={() => window.open(pdfUrl, '_blank', 'noopener')}
            testId="more-download-pdf"
          >
            Скачать PDF
          </DropdownMenu.Item>
        </>
      )}
    </DropdownMenu>
  );
}
