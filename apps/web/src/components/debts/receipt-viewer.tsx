'use client';

/**
 * CHEK KO'RUVCHI (2026-07-14).
 *
 * MUAMMO: «Chekni ko'rish» havolasi ochilmasdi. Rasm API'si (`/attachments/:id/raw`)
 * JwtAuthGuard ostida, oddiy `<a href>` / `<img src>` esa `Authorization`
 * sarlavhasini yubormaydi ⇒ server 401 qaytarardi va operator bo'sh oyna ko'rardi.
 * (Jonli tekshirildi: sarlavhasiz 401, token bilan 200 image/jpeg.)
 *
 * YECHIM: rasm token bilan fetch qilinadi (`api.blobUrl`), blob URL yasaladi va
 * MODAL oynada ko'rsatiladi — sahifadan chiqmasdan.
 *
 * Chek nizoli holatda dalil bo'lgani uchun uchta amal bor:
 *   🔍 Kattalashtirish — chekdagi mayda raqamlar o'qilsin
 *   ⬇️ Yuklab olish   — buxgalteriyaga/arxivga
 *   ↗️ Yangi oynada   — to'liq ekranda solishtirish
 *
 * Blob URL yopilganda BEKOR QILINADI — aks holda har ochilgan chek xotirada
 * qolib ketadi.
 */

import { api } from '@/lib/api-client';
import { Button, Modal, Spinner } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ReceiptViewer({
  attachmentId,
  title,
  open,
  onClose,
}: {
  attachmentId: string | null;
  /** Modal sarlavhasi — odatda mijoz ismi + summa. */
  title?: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pages.debts');
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!open || !attachmentId) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    setUrl(null);
    setError(null);
    setZoom(false);

    api
      .blobUrl(`/attachments/${attachmentId}/raw`)
      .then((r) => {
        if (cancelled) {
          URL.revokeObjectURL(r.url); // modal yopilib ulgurgan — darhol bo'shatamiz
          return;
        }
        objectUrl = r.url;
        setUrl(r.url);
        setMime(r.mime);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, attachmentId]);

  const isImage = mime.startsWith('image/');

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title ? `${t('receipt_title')} — ${title}` : t('receipt_title')}
      // Chek — rasm, standart 480px torlik qiladi. Ekranga sig'adigan darajada keng.
      widthClass="w-[min(900px,92vw)]"
      testId="receipt-modal"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex gap-2">
            {url && isImage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setZoom((z) => !z)}
                data-test-id="receipt-zoom"
              >
                {zoom ? t('receipt_fit') : t('receipt_zoom')}
              </Button>
            )}
            {url && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(url, '_blank', 'noopener')}
                  data-test-id="receipt-newtab"
                >
                  {t('receipt_new_tab')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `chek-${attachmentId?.slice(0, 8)}`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                  data-test-id="receipt-download"
                >
                  {t('receipt_download')}
                </Button>
              </>
            )}
          </div>
          <Button onClick={onClose}>{t('cancel')}</Button>
        </div>
      }
    >
      <div
        className="flex min-h-[240px] items-center justify-center overflow-auto rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-muted)] p-2"
        data-test-id="receipt-body"
      >
        {error && (
          <div className="text-center text-[var(--ms-text-destructive)] text-sm">
            <div>{t('receipt_error')}</div>
            <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{error}</div>
          </div>
        )}

        {!error && !url && <Spinner label={t('receipt_loading')} />}

        {!error && url && isImage && (
          // biome-ignore lint/a11y/useAltText: alt matni t() dan keladi
          <img
            src={url}
            alt={t('receipt_title')}
            className={
              zoom
                ? 'max-w-none cursor-zoom-out'
                : 'max-h-[65vh] w-auto cursor-zoom-in object-contain'
            }
            onClick={() => setZoom((z) => !z)}
            onKeyDown={(e) => e.key === 'Enter' && setZoom((z) => !z)}
            data-test-id="receipt-image"
          />
        )}

        {/* Rasm emas (masalan PDF chek) — brauzer o'zi ko'rsatsin */}
        {!error && url && !isImage && (
          <iframe src={url} title={t('receipt_title')} className="h-[65vh] w-full border-0" />
        )}
      </div>
    </Modal>
  );
}
