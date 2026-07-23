'use client';

/**
 * useBarcodeCamera — the address-storage barcode SCANNING SCREEN as a hook
 * (extracted verbatim from cell-scan-bind-modal 2026-07-21 so «Sanash» and
 * «Ko'chirish» reuse the exact camera pipeline the owner's phone battles
 * hardened):
 *
 *   - our OWN frame loop: every ~300ms the current video frame is drawn to a
 *     canvas and decoded — native BarcodeDetector first (best 1D reader on
 *     Androids; one throw marks it broken), then zxing decodeFromCanvas (pure
 *     JS, identical everywhere). No zxing video-lifecycle magic.
 *   - alternating wide/zoom views per tick: whole frame ≤800px catches
 *     close-ups, the center strip at ≤1600px keeps arm's-length labels
 *     decodable (downscaled bars drop below 1px and become unreadable).
 *   - a 2.5s same-code guard so holding one label under the lens doesn't
 *     re-fire every tick; the attempt counter is exposed for the on-screen
 *     «is the decoder even running?» diagnostics.
 *
 * The hook auto-starts while `active` and fully stops (tracks + loop) when
 * inactive/unmounted. `onDecoded` is ref-pinned — consumers pass fresh
 * closures with zero camera restarts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal BarcodeDetector surface (not in TS lib.dom yet). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
function makeNativeDetector(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({
      formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'qr_code'],
    });
  } catch {
    return null;
  }
}

/** zxing decode surface we use (loaded dynamically). */
interface ZxingReaderLike {
  decodeFromCanvas(canvas: HTMLCanvasElement): { getText(): string };
}

export function useBarcodeCamera({
  active,
  onDecoded,
  cameraErrorText,
}: {
  /** Camera runs while true (typically = modal open). */
  active: boolean;
  /** Fires per decoded code (2.5s same-code guard applied). */
  onDecoded: (code: string) => void;
  /** Localized «camera failed» text. */
  cameraErrorText: string;
}) {
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ engine: string; attempts: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastReadRef = useRef<{ code: string; at: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const zxingRef = useRef<ZxingReaderLike | null>(null);
  const nativeRef = useRef<BarcodeDetectorLike | null>(null);
  const nativeBrokenRef = useRef(false);
  const attemptsRef = useRef(0);

  // Consumers pass fresh closures; the loop always calls the LATEST one.
  const onDecodedRef = useRef(onDecoded);
  useEffect(() => {
    onDecodedRef.current = onDecoded;
  }, [onDecoded]);
  const errorTextRef = useRef(cameraErrorText);
  useEffect(() => {
    errorTextRef.current = cameraErrorText;
  }, [cameraErrorText]);

  const handleDecoded = useCallback((raw: string) => {
    const now = Date.now();
    const last = lastReadRef.current;
    if (!last || last.code !== raw || now - last.at > 2500) {
      lastReadRef.current = { code: raw, at: now };
      onDecodedRef.current(raw);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
    loopTimerRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    attemptsRef.current = 0;
    setDiag(null);
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      // High resolution matters: hand-held phone labels at 640×480 blur into
      // undecodable smears — ask for 1080p and continuous autofocus.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try {
        await track?.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        });
      } catch {
        // focusMode is not universal — best-effort only.
      }
      const video = videoRef.current;
      if (!video) {
        for (const t2 of stream.getTracks()) t2.stop();
        streamRef.current = null;
        setCameraError(errorTextRef.current);
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);

      nativeRef.current = makeNativeDetector();
      nativeBrokenRef.current = false;
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      // 1D-only formats: our labels are Code-128 (cells) and EAN/Code-128
      // (products). QR + TRY_HARDER together froze weak main threads.
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
      ]);
      zxingRef.current = new BrowserMultiFormatReader(hints) as unknown as ZxingReaderLike;

      attemptsRef.current = 0;
      const tick = async () => {
        const v = videoRef.current;
        if (!streamRef.current || !v) return; // camera stopped
        if (v.readyState >= 2 && v.videoWidth > 0) {
          // Alternate wide (whole frame ≤800px) and zoom (center strip ≤1600px).
          const zoom = attemptsRef.current % 2 === 1;
          let sx = 0;
          let sy = 0;
          let sw = v.videoWidth;
          let sh = v.videoHeight;
          let maxW = 800;
          if (zoom) {
            sw = Math.round(v.videoWidth * 0.7);
            sh = Math.round(v.videoHeight * 0.5);
            sx = Math.round((v.videoWidth - sw) / 2);
            sy = Math.round((v.videoHeight - sh) / 2);
            maxW = 1600;
          }
          const scale = Math.min(1, maxW / sw);
          if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
          const canvas = canvasRef.current;
          canvas.width = Math.round(sw * scale);
          canvas.height = Math.round(sh * scale);
          const c2d = canvas.getContext('2d', { willReadFrequently: true });
          if (c2d) {
            c2d.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            let decoded: string | null = null;
            if (nativeRef.current && !nativeBrokenRef.current) {
              try {
                decoded = (await nativeRef.current.detect(canvas))[0]?.rawValue ?? null;
              } catch {
                // ML-Kit service absent (frequent on Android) — zxing carries on.
                nativeBrokenRef.current = true;
              }
            }
            if (!decoded && zxingRef.current) {
              try {
                decoded = zxingRef.current.decodeFromCanvas(canvas).getText();
              } catch {
                // no code in this frame — the normal miss case
              }
            }
            attemptsRef.current += 1;
            if (attemptsRef.current % 4 === 1) {
              setDiag({
                engine: nativeRef.current && !nativeBrokenRef.current ? 'tel+zxing' : 'zxing',
                attempts: attemptsRef.current,
              });
            }
            if (decoded) handleDecoded(decoded);
          }
        }
        loopTimerRef.current = window.setTimeout(() => void tick(), 300);
      };
      void tick();
    } catch {
      setCameraError(errorTextRef.current);
      stopCamera();
    }
  }, [handleDecoded, stopCamera]);

  // Auto-start with `active`; full stop when inactive/unmounted.
  useEffect(() => {
    if (!active) {
      stopCamera();
      return;
    }
    const id = window.setTimeout(() => void startCamera(), 60);
    return () => window.clearTimeout(id);
  }, [active, startCamera, stopCamera]);
  useEffect(() => stopCamera, [stopCamera]);

  return { videoRef, cameraOn, cameraError, diag, startCamera, stopCamera };
}
