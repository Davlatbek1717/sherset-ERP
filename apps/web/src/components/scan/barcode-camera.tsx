'use client';

/**
 * BarcodeCamera — kamera orqali 1D shtrix-kod / QR o'quvchi (mobil telefon yoki
 * noutbuk veb-kamerasi). `html5-qrcode` brauzer-only kutubxonasi dinamik import
 * qilinadi; u Code128 (yacheyka labellari) va EAN13 (mahsulot shtrixlari) kabi
 * formatlarni o'qiydi. Har o'qilgan matn `onResult` ga uzatiladi — bir xil kod
 * qisqa oraliqda takror o'qilsa (kamera sekundiga ko'p kadr yuboradi) tashlanadi.
 *
 * Kamera ochilmasligi mumkin (qurilma yo'q / ruxsat rad etilgan) — aniq xatolik
 * ko'rsatiladi va chaqiruvchi doim qo'lda/USB-skaner maydonini zaxira sifatida
 * qoldiradi. `restock/qr-scanner.tsx` bilan bir naqsh, lekin umumiy (har qanday
 * skan oqimida qayta ishlatiladi) va o'z DOM-id'siga ega.
 */
import { useEffect, useRef, useState } from 'react';

const READER_ID = 'barcode-camera-reader';

export function BarcodeCamera({
  onResult,
  dedupeMs = 1500,
}: {
  onResult: (text: string) => void;
  /** Bir xil kodni shu oraliqda takror o'qishni tashlab yuboradi. */
  dedupeMs?: number;
}) {
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
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText: string) => {
            const now = Date.now();
            if (decodedText === lastRef.current.text && now - lastRef.current.at < dedupeMs) return;
            lastRef.current = { text: decodedText, at: now };
            onResultRef.current(decodedText.trim());
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
  }, [dedupeMs]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        id={READER_ID}
        className="w-full max-w-[320px] overflow-hidden rounded-[var(--ms-radius-default)]"
      />
      {starting && !error && (
        <div className="text-[var(--ms-text-muted)] text-sm">Kamera ochilmoqda…</div>
      )}
      {error && (
        <div
          className="text-[var(--ms-text-destructive)] text-sm"
          data-test-id="barcode-camera-error"
        >
          {error}
        </div>
      )}
    </div>
  );
}
