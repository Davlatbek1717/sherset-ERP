'use client';

import { ImageLightbox } from '@/components/image-lightbox';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { useImagePaste } from '@/hooks/use-image-paste';
import { api } from '@/lib/api-client';
import { imageRawUrl } from '@/lib/image-url';
import {
  ACCEPTED_IMAGE_ATTR,
  type ImageReject,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  capImagesToLimit,
  classifyImageFile,
  readClipboardImageFiles,
  readImageAsDataUrl,
} from '@/lib/product-image';
import { Button, Icons } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

interface ProductImage {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  position: number;
  isMain: boolean;
  createdAt: string;
}

export interface ImageGalleryProps {
  productId: string;
}

/**
 * ImageGallery — moysklad "Изображения" tab parity.
 *
 * Renders the image grid for one Product:
 *   - Thumbnails (8rem square) sorted main → position
 *   - "Asosiy" badge on the cover image
 *   - "Set as main" + delete buttons on hover
 *   - Drop-zone for new uploads (file picker only; full DnD deferred)
 */
export function ImageGallery({ productId }: ImageGalleryProps) {
  const qc = useQueryClient();
  const t = useTranslations('pages.images');
  const tCommon = useTranslations('common');
  const { runDestructive } = useDestructiveMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const list = useQuery<{ items: ProductImage[] }>({
    queryKey: ['product-images', productId],
    queryFn: () => api.get<{ items: ProductImage[] }>(`/products/${productId}/images`),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await readImageAsDataUrl(file);
      return api.post<ProductImage>(`/products/${productId}/images`, {
        filename: file.name,
        mime: file.type || 'image/png',
        dataBase64,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-images', productId] }),
    onError: (e: Error) => setError(e.message),
  });

  const rejectMsg = (r: ImageReject) =>
    r === 'too_large'
      ? tCommon('image_too_large', { size: (MAX_IMAGE_BYTES / 1_000_000).toFixed(0) })
      : tCommon('image_bad_format');

  // Single entry point for BOTH the file picker and clipboard paste — same
  // size/format gate, same base64 upload (user 2026-07-06). Validate first, then
  // cap the batch to the MAX_IMAGES-per-product limit (user 2026-07-07) so a
  // rejected file never wastes a slot and the «max reached» message is accurate.
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    const valid: File[] = [];
    for (const file of files) {
      const bad = classifyImageFile(file);
      if (bad) setError(rejectMsg(bad));
      else valid.push(file);
    }
    const { accepted, overflow } = capImagesToLimit(list.data?.items?.length ?? 0, valid);
    if (overflow) setError(tCommon('image_max', { max: MAX_IMAGES }));
    for (const file of accepted) {
      try {
        await uploadMut.mutateAsync(file);
      } catch {
        // Error already surfaced via onError; continue with the next file.
      }
    }
  };

  // Ctrl+V anywhere on the edit page → paste the copied image.
  useImagePaste(addFiles);

  // Explicit «Вставить» button → read the clipboard on demand (gives the
  // «no image in clipboard» message the passive paste can't).
  const pasteFromClipboard = async () => {
    setError(null);
    try {
      const files = await readClipboardImageFiles();
      if (files.length === 0) {
        setError(tCommon('image_no_clipboard'));
        return;
      }
      await addFiles(files);
    } catch {
      setError(tCommon('image_no_clipboard'));
    }
  };

  const setMainMut = useApiMutation({
    mutationFn: (imageId: string) =>
      api.put<{ ok: true }>(`/products/${productId}/images/${imageId}/main`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-images', productId] }),
  });

  const deleteMut = useApiMutation({
    mutationFn: (imageId: string) =>
      api.delete<{ ok: true }>(`/products/${productId}/images/${imageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-images', productId] }),
  });

  const triggerPicker = () => fileInputRef.current?.click();

  const handlePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await addFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const items = list.data?.items ?? [];
  // moysklad-style small gallery: at most MAX_IMAGES per product — the add
  // controls turn off once the limit is reached (user 2026-07-07).
  const atMax = items.length >= MAX_IMAGES;

  return (
    <div className="space-y-3" data-test-id="image-gallery">
      {error && (
        <div className="text-[var(--ms-text-destructive)] text-sm" role="alert">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {items.map((img) => {
            const url = imageRawUrl(img.id);
            return (
              <div
                key={img.id}
                className="group relative h-32 w-32 overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]"
                data-test-id={`image-${img.id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: click-to-zoom thumbnail is a mouse convenience; the image opens a lightbox, not a control */}
                <img
                  src={url}
                  alt={img.filename}
                  className="h-full w-full cursor-zoom-in object-cover"
                  loading="lazy"
                  onClick={() => setLightbox(url)}
                />
                {img.isMain && (
                  <span
                    className="absolute top-1 left-1 rounded bg-[var(--ms-action-primary)] px-1.5 py-0.5 font-medium text-[10px] text-white uppercase tracking-wide"
                    data-test-id={`image-${img.id}-main-badge`}
                  >
                    {t('main_badge')}
                  </span>
                )}
                <div className="absolute inset-x-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!img.isMain && (
                    <button
                      type="button"
                      className="flex-1 rounded bg-white/95 px-1 py-0.5 font-medium text-[10px] text-[var(--ms-text-primary)] hover:bg-white"
                      onClick={() => setMainMut.mutate(img.id)}
                      disabled={setMainMut.isPending}
                      data-test-id={`image-${img.id}-set-main`}
                    >
                      {t('set_main')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded bg-[var(--ms-action-destructive,#dc2626)] px-1 py-0.5 font-medium text-[10px] text-white hover:opacity-90"
                    onClick={() =>
                      runDestructive({
                        title: tCommon('delete_confirm', { name: img.filename }),
                        run: () => deleteMut.mutateAsync(img.id),
                      })
                    }
                    disabled={deleteMut.isPending}
                    data-test-id={`image-${img.id}-delete`}
                  >
                    {tCommon('delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add controls: «⊕ Изображение» (file) + «Вставить» (clipboard). Both
        feed the same upload; Ctrl+V works anywhere too. Minimal, no drop-zone. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={triggerPicker}
          disabled={uploadMut.isPending || atMax}
          className="inline-flex items-center gap-1.5"
          data-test-id="image-upload-button"
        >
          <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
          {uploadMut.isPending ? tCommon('saving') : t('upload_button')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={pasteFromClipboard}
          disabled={uploadMut.isPending || atMax}
          className="inline-flex items-center gap-1.5"
          data-test-id="image-paste-button"
        >
          {tCommon('image_paste')}
        </Button>
        <span className="text-[var(--ms-text-muted)] text-xs" data-test-id="image-limit-hint">
          {atMax ? tCommon('image_max', { max: MAX_IMAGES }) : tCommon('image_paste_hint')}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_ATTR}
        multiple
        className="hidden"
        onChange={handlePicked}
        data-test-id="image-file-input"
      />

      {/* Subtle reset/clear button if upload had errors */}
      {error && (
        <Button variant="ghost" size="sm" onClick={() => setError(null)}>
          {tCommon('cancel')}
        </Button>
      )}

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
