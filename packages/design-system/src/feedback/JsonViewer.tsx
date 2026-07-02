'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';
import { Modal } from './Modal.tsx';

/**
 * Read-only raw JSON viewer modal — moysklad's "Открыть в API" feature
 * surfaces the API representation of a document (and any other JSON
 * payload) so developers and integrators can see exactly what the
 * server returns without leaving the page.
 *
 * Renders the data as a syntax-friendly `<pre>` block (monospace,
 * tabular-nums, no wrap), with a Copy button that puts the formatted
 * JSON on the clipboard. The download/upload story is intentionally
 * absent — moysklad's modal is read-only and we mirror that.
 *
 * The clipboard write is gated on a guard so SSR / non-secure-context
 * environments degrade silently rather than throwing.
 */
export interface JsonViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modal title — defaults to "JSON". */
  title?: React.ReactNode;
  /** Any value that survives JSON.stringify. */
  data: unknown;
  /** Override the copy-button label (defaults to "Nusxa olish"). */
  copyLabel?: string;
  /** Toast text after a successful copy (defaults to "Buferga nusxalandi"). */
  copiedLabel?: string;
  /** Override the close-button label. */
  closeLabel?: string;
  /** Optional test id for the modal root. */
  testId?: string;
}

function safeStringify(value: unknown): string {
  // Guard against circular refs / BigInt — both throw on plain stringify.
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v && typeof v === 'object') {
        if (seen.has(v as object)) return '[Circular]';
        seen.add(v as object);
      }
      return v;
    },
    2,
  );
}

export function JsonViewer({
  open,
  onOpenChange,
  title = 'JSON',
  data,
  copyLabel = 'Nusxa olish',
  copiedLabel = 'Buferga nusxalandi',
  closeLabel = 'Yopish',
  testId,
}: JsonViewerProps) {
  const [copied, setCopied] = React.useState(false);

  // Reset the "copied" label when the modal re-opens so users always
  // see the action label first.
  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const formatted = React.useMemo(() => safeStringify(data), [data]);

  const handleCopy = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Permission denied / non-secure context — degrade silently.
    }
  }, [formatted]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      widthClass="w-[640px]"
      closeLabel={closeLabel}
      testId={testId}
      footer={
        <>
          <Button variant="tertiary" size="sm" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            data-test-id="json-viewer-copy"
          >
            {copied ? copiedLabel : copyLabel}
          </Button>
        </>
      }
    >
      <pre
        data-test-id="json-viewer-body"
        className={cn(
          'whitespace-pre m-0 p-4 font-mono text-[12px] leading-[1.55] tabular-nums',
          'text-[var(--ms-text-primary)]',
        )}
      >
        {formatted}
      </pre>
    </Modal>
  );
}
