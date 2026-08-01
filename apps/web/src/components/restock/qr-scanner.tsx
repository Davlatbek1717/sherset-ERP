'use client';

/**
 * QrScanner — camera QR reader for the restock placement-confirm step. The
 * omborchi scans a product's senik QR (which encodes «{origin}/products/{id}»);
 * we hand the decoded text back to the parent, which extracts the product id and
 * confirms the matching restock line.
 *
 * html5-qrcode is dynamically imported (browser-only). Camera access can fail
 * (no device / permission denied) — we surface a clear error and the parent
 * always keeps a manual «placed» button as a fallback.
 */
import { useEffect, useRef, useState } from 'react';

const READER_ID = 'restock-qr-reader';

export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stopped = false;
    // biome-ignore lint/suspicious/noExplicitAny: html5-qrcode has no bundled types here
    let scanner: any = null;
    (async () => {
      try {
        const mod = await import('html5-qrcode');
        if (stopped) return;
        scanner = new mod.Html5Qrcode(READER_ID);
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decodedText: string) => {
            // Debounce identical reads (the camera fires many frames/sec).
            const now = Date.now();
            if (decodedText === lastRef.current.text && now - lastRef.current.at < 2500) return;
            lastRef.current = { text: decodedText, at: now };
            onResultRef.current(decodedText);
          },
          () => {
            /* per-frame decode misses — ignore */
          },
        );
        if (!stopped) setStarting(false);
      } catch (e) {
        if (!stopped) {
          setStarting(false);
          setError(e instanceof Error ? e.message : 'Kamerani ochib bo‘lmadi');
        }
      }
    })();
    return () => {
      stopped = true;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div id={READER_ID} className="w-full max-w-[320px] overflow-hidden rounded-md" />
      {starting && !error && (
        <div className="text-[var(--ms-text-muted)] text-sm">Kamera ochilmoqda…</div>
      )}
      {error && (
        <div className="text-[var(--ms-text-destructive)] text-sm" data-test-id="qr-scanner-error">
          {error}
        </div>
      )}
    </div>
  );
}
