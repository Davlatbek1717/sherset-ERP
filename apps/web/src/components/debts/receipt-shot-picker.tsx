'use client';

/**
 * CHEK RASMI TANLAGICH (2026-07-17 talab) — uch yo'l bilan rasm qo'shish:
 *   🖼 FAYL/SCREENSHOT — odatiy fayl tanlash oynasi
 *   📷 KAMERA          — getUserMedia modali: jonli ko'rinish → «Rasmga olish»
 *                        (desktop webcam ham, telefon kamerasi ham ishlaydi;
 *                        kamera yo'q/ruxsat berilmasa aniq xato ko'rsatiladi)
 *   📋 PASTE (Ctrl+V)  — clipboard'dagi screenshot to'g'ridan-to'g'ri joylanadi
 *
 * Click chekida rasm MAJBURIY, hisob raqamda IXTIYORIY — majburiylikni
 * chaqiruvchi belgilaydi (required prop faqat ko'rinishga ta'sir qiladi).
 * Natija — data-URI (server base64 qabul qiladi, mavjud oqim o'zgarmaydi).
 */

import { Button, Modal } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Chek rasmi uchun chegara — katta fayl API'ni bo'g'masin (form bilan bir xil). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ReceiptShot {
  dataUri: string;
  name: string;
  mime: string;
}

/** Kamera modali — video oqim → canvas → JPEG data-URI. */
function CameraModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (shot: ReceiptShot) => void;
}) {
  const t = useTranslations('pages.debts');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Oqimni to'xtatish — modal yopilganda kamera chiroq o'chsin (privacy).
  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        // environment — telefonda orqa kamera (chekni suratga olish uchun);
        // desktop'da mavjud webcam olinadi.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          for (const tr of stream.getTracks()) tr.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        // Kamera yo'q / ruxsat berilmadi / xavfsiz kontekst emas.
        if (!cancelled) setError(t('camera_error'));
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream, t]);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUri = canvas.toDataURL('image/jpeg', 0.92);
    stopStream();
    onCapture({
      dataUri,
      name: `kamera-chek-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.jpg`,
      mime: 'image/jpeg',
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('camera_title')}
      testId="camera-modal"
      widthClass="w-[min(640px,94vw)]"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} data-test-id="camera-cancel">
            {t('cancel')}
          </Button>
          <Button onClick={capture} disabled={!ready} data-test-id="camera-capture">
            📷 {t('camera_capture')}
          </Button>
        </div>
      }
    >
      {error ? (
        <div
          className="rounded-[var(--ms-radius-default)] bg-[var(--ms-destructive-100)] px-3 py-2 text-[var(--ms-destructive-600)] text-sm"
          data-test-id="camera-error"
        >
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full rounded-[var(--ms-radius-default)] bg-black"
          data-test-id="camera-video"
        />
      )}
    </Modal>
  );
}

export function ReceiptShotPicker({
  shot,
  onShot,
  onError,
  required,
  testPrefix,
}: {
  shot: ReceiptShot | null;
  onShot: (shot: ReceiptShot | null) => void;
  /** Fayl juda katta bo'lsa va sh.k. — xabar chaqiruvchi formada ko'rsatiladi. */
  onError: (message: string | null) => void;
  /** true — «majburiy» ko'rinishi (yulduzcha + hint); false — «ixtiyoriy». */
  required: boolean;
  testPrefix: string;
}) {
  const t = useTranslations('pages.debts');
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  function acceptFile(file: File | undefined | null) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      onError(t('screenshot_too_big'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onShot({ dataUri: String(reader.result), name: file.name, mime: file.type || 'image/png' });
      onError(null);
    };
    reader.readAsDataURL(file);
  }

  /** Ctrl+V — clipboard'dagi rasmni to'g'ridan-to'g'ri qabul qilamiz. */
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    acceptFile(item.getAsFile());
  }

  return (
    <div onPaste={onPaste}>
      <div className="mb-1 text-[var(--ms-text-muted)] text-xs">
        {t('screenshot_label')}
        {required ? (
          <span className="ml-1 text-[var(--ms-destructive-500)]">*</span>
        ) : (
          <span className="ml-1">({t('screenshot_optional')})</span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          // Xuddi shu faylni qayta tanlash ham ishlashi uchun qiymat tozalanadi.
          e.target.value = '';
        }}
        data-test-id={`${testPrefix}-shot-input`}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          data-test-id={`${testPrefix}-shot-pick`}
        >
          🖼 {shot ? t('screenshot_change') : t('screenshot_pick')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCameraOpen(true)}
          data-test-id={`${testPrefix}-shot-camera`}
        >
          📷 {t('camera_open')}
        </Button>
      </div>

      {shot ? (
        <div className="mt-2">
          {/* next/image emas: bu data-URI (lokal tanlangan/olingan rasm). */}
          <img
            src={shot.dataUri}
            alt={shot.name}
            className="max-h-40 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]"
          />
          <div className="mt-1 flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
            <span className="truncate">{shot.name}</span>
            <button
              type="button"
              onClick={() => onShot(null)}
              className="text-[var(--ms-text-destructive)] hover:underline"
              data-test-id={`${testPrefix}-shot-remove`}
            >
              {t('screenshot_remove')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
          {required ? t('screenshot_required') : t('screenshot_paste_hint')}
        </div>
      )}

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(s) => {
          onShot(s);
          onError(null);
        }}
      />
    </div>
  );
}
