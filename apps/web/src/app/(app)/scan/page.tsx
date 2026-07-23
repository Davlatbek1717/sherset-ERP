'use client';

/**
 * /scan — phone-first barcode/QR lookup (USER-DIRECTED 2026-07-05).
 *
 * Two entry paths:
 *   1. A phone camera reads a printed QR label (payload = /scan?c=<code>) →
 *      the browser lands here with ?c= and we jump straight to the product.
 *   2. The user opens /scan by hand: a big manual input + an in-page camera
 *      scanner (BarcodeDetector API — Chrome/Android; reads QR AND Code 128,
 *      so old raw-code labels work too). No detector support → input only.
 *
 * Lookup reuses the products list search (name/code/article/barcode). One hit
 * → redirect to the card; several → tap-list; none → «не найдено».
 */

import { api } from '@/lib/api-client';
import { normalizeScanInput } from '@/lib/scan';
import { Button, Input } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

interface ProductHit {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  barcodes: string[] | null;
}

/** Cell-barcode lookup result (owner 2026-07-19: scanning a SHELF label shows
 *  what lives in that cell). Shape = GET /admin/stores/cells/by-barcode. */
interface CellLookup {
  cells: Array<{
    id: string;
    name: string;
    barcode: string | null;
    storeId: string;
    storeName: string;
    zoneName: string | null;
  }>;
  products: Array<{ id: string; name: string; code: string | null; archived: boolean }>;
  stock: Array<{
    assortmentKind: string;
    assortmentId: string;
    name: string;
    code: string | null;
    qty: string;
  }>;
}

/** Minimal BarcodeDetector surface (not yet in TS lib.dom). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

function ScanPageInner() {
  const t = useTranslations('pages.scan');
  const router = useRouter();
  const params = useSearchParams();

  const [value, setValue] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'searching' | 'none' | 'multiple' | 'error' | 'cell' | 'cell_ambiguous'
  >('idle');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [cellData, setCellData] = useState<CellLookup | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorSupported = !!getBarcodeDetector();

  const lookup = useCallback(
    async (raw: string) => {
      const code = normalizeScanInput(raw);
      if (!code) return;
      setStatus('searching');
      setHits([]);
      setCellData(null);
      try {
        const res = await api.get<{ items: ProductHit[] }>(
          `/products?search=${encodeURIComponent(code)}&limit=10`,
        );
        const items = res.items ?? [];
        // Prefer the EXACT barcode/code hit — a scanned token is never a prefix.
        const exact = items.filter((p) => p.barcodes?.includes(code) || p.code === code);
        const winners = exact.length > 0 ? exact : items;
        if (winners.length === 1 && winners[0]) {
          router.replace(`/products/${winners[0].id}`);
          return;
        }
        if (winners.length === 0) {
          // Not a product — a SHELF label? (owner 2026-07-19: scanning just the
          // cell barcode shows the cell and everything bound/stored in it.)
          const cellRes = await api
            .get<CellLookup>(`/admin/stores/cells/by-barcode?code=${encodeURIComponent(code)}`)
            .catch(() => null);
          if (cellRes && cellRes.cells.length === 1) {
            setCellData(cellRes);
            setStatus('cell');
            return;
          }
          if (cellRes && cellRes.cells.length > 1) {
            setCellData(cellRes);
            setStatus('cell_ambiguous');
            return;
          }
          setStatus('none');
          return;
        }
        setHits(winners);
        setStatus('multiple');
      } catch {
        setStatus('error');
      }
    },
    [router],
  );

  // Entry path 1: the printed QR brought us here with ?c=.
  const codeParam = params?.get('c') ?? '';
  useEffect(() => {
    if (codeParam) {
      setValue(codeParam);
      void lookup(codeParam);
    }
  }, [codeParam, lookup]);

  const stopCamera = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    const Ctor = getBarcodeDetector();
    if (!Ctor) return;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      // The <video> element is ALWAYS mounted (hidden while the camera is
      // off) — attaching the stream BEFORE flipping cameraOn avoids the
      // first-open race where the ref was still null right after setState
      // (the stream stayed live but never reached the element: gray box,
      // no detection — the bug the user hit on the phone).
      const video = videoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
        setCameraError(t('camera_error'));
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      const detector = new Ctor({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          const raw = found[0]?.rawValue;
          if (raw) {
            stopCamera();
            setValue(raw);
            void lookup(raw);
            return;
          }
        } catch {
          // detector hiccup on a not-yet-ready frame — keep polling
        }
        window.setTimeout(() => void tick(), 200);
      };
      void tick();
    } catch {
      setCameraError(t('camera_error'));
      stopCamera();
    }
  }, [lookup, stopCamera, t]);

  useEffect(() => stopCamera, [stopCamera]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void lookup(value);
            }
          }}
          placeholder={t('input_placeholder')}
          inputMode="search"
          autoFocus
          className="h-11 flex-1 text-base"
          data-test-id="scan-input"
        />
        <Button
          type="button"
          onClick={() => void lookup(value)}
          disabled={!value.trim() || status === 'searching'}
          className="h-11"
          data-test-id="scan-find"
        >
          {t('find')}
        </Button>
      </div>

      {detectorSupported ? (
        <div className="flex flex-col gap-2">
          {/* Always mounted so the ref exists BEFORE the stream attaches. */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)]"
            style={{ display: cameraOn ? 'block' : 'none' }}
            data-test-id="scan-video"
          />
          {cameraOn ? (
            <>
              <p className="text-[var(--ms-text-muted)] text-sm">{t('hint')}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={stopCamera}
                className="h-11"
                data-test-id="scan-stop-camera"
              >
                {t('stop_camera')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void startCamera()}
              className="h-11"
              data-test-id="scan-start-camera"
            >
              {t('scan_camera')}
            </Button>
          )}
          {cameraError && <p className="text-[var(--ms-text-danger)] text-sm">{cameraError}</p>}
        </div>
      ) : (
        <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="scan-no-detector">
          {t('camera_unsupported')}
        </p>
      )}

      {status === 'searching' && (
        <p className="text-[var(--ms-text-muted)] text-sm">{t('searching')}</p>
      )}
      {status === 'none' && (
        <p className="text-[var(--ms-text-danger)] text-sm" data-test-id="scan-not-found">
          {t('not_found')}
        </p>
      )}
      {status === 'error' && <p className="text-[var(--ms-text-danger)] text-sm">{t('error')}</p>}

      {/* Shelf-label hit (owner 2026-07-19): the cell + what lives in it. */}
      {status === 'cell' && cellData?.cells[0] && (
        <div
          className="flex flex-col gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3"
          data-test-id="scan-cell-panel"
        >
          <div>
            <div className="font-semibold text-[var(--ms-text-primary)] text-lg">
              {cellData.cells[0].name}
            </div>
            <div className="text-[var(--ms-text-muted)] text-sm">
              {[cellData.cells[0].storeName, cellData.cells[0].zoneName]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {(() => {
            // One merged list: bound products first (with qty when stock has
            // it), then stock-only rows (e.g. variants placed by documents).
            const qtyById = new Map(cellData.stock.map((s) => [s.assortmentId, s.qty]));
            const boundIds = new Set(cellData.products.map((p) => p.id));
            const rows = [
              ...cellData.products.map((p) => ({
                key: p.id,
                href: `/products/${p.id}`,
                name: p.name,
                code: p.code,
                qty: qtyById.get(p.id) ?? null,
              })),
              ...cellData.stock
                .filter((s) => !boundIds.has(s.assortmentId))
                .map((s) => ({
                  key: s.assortmentId,
                  href: s.assortmentKind === 'variant' ? null : `/products/${s.assortmentId}`,
                  name: s.name,
                  code: s.code,
                  qty: s.qty,
                })),
            ];
            if (rows.length === 0) {
              return (
                <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="scan-cell-empty">
                  {t('cell_empty')}
                </p>
              );
            }
            return (
              <div className="flex flex-col gap-1" data-test-id="scan-cell-products">
                {rows.map((r) => {
                  const sub = [r.code, r.qty != null ? `${t('cell_qty')}: ${r.qty}` : null]
                    .filter(Boolean)
                    .join(' · ');
                  const cls =
                    'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-2.5 text-sm';
                  return r.href ? (
                    <Link
                      key={r.key}
                      href={r.href}
                      className={`${cls} hover:bg-[var(--ms-bg-muted)]`}
                      data-test-id="scan-cell-product-row"
                    >
                      <span className="block font-medium text-[var(--ms-text-primary)]">
                        {r.name}
                      </span>
                      <span className="block text-[var(--ms-text-muted)] text-xs">{sub}</span>
                    </Link>
                  ) : (
                    <div key={r.key} className={cls} data-test-id="scan-cell-product-row">
                      <span className="block font-medium text-[var(--ms-text-primary)]">
                        {r.name}
                      </span>
                      <span className="block text-[var(--ms-text-muted)] text-xs">{sub}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
      {status === 'cell_ambiguous' && cellData && (
        <div className="flex flex-col gap-1" data-test-id="scan-cell-ambiguous">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('cell_ambiguous')}</p>
          {cellData.cells.map((c) => (
            <div
              key={c.id}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-2.5 text-sm"
            >
              <span className="block font-medium text-[var(--ms-text-primary)]">{c.name}</span>
              <span className="block text-[var(--ms-text-muted)] text-xs">
                {[c.storeName, c.zoneName].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {status === 'multiple' && (
        <div className="flex flex-col gap-1" data-test-id="scan-results">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('multiple')}</p>
          {hits.map((h) => (
            <Link
              key={h.id}
              href={`/products/${h.id}`}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-2.5 text-sm hover:bg-[var(--ms-bg-muted)]"
              data-test-id="scan-result-row"
            >
              <span className="block font-medium text-[var(--ms-text-primary)]">{h.name}</span>
              <span className="block text-[var(--ms-text-muted)] text-xs">
                {[h.code, h.article].filter(Boolean).join(' · ')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  // useSearchParams requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <ScanPageInner />
    </Suspense>
  );
}
