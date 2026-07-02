'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
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

const MAX_BYTES = 4_000_000;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Read failed'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.readAsDataURL(file);
  });
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

  const list = useQuery<{ items: ProductImage[] }>({
    queryKey: ['product-images', productId],
    queryFn: () => api.get<{ items: ProductImage[] }>(`/products/${productId}/images`),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) {
        throw new Error(t('error_too_large', { size: (MAX_BYTES / 1_000_000).toFixed(0) }));
      }
      const dataBase64 = await readFileAsBase64(file);
      return api.post<ProductImage>(`/products/${productId}/images`, {
        filename: file.name,
        mime: file.type || 'image/png',
        dataBase64,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-images', productId] }),
    onError: (e: Error) => setError(e.message),
  });

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
    setError(null);
    for (const file of Array.from(files)) {
      try {
        await uploadMut.mutateAsync(file);
      } catch {
        // Error already surfaced via onError; continue with next file.
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const items = list.data?.items ?? [];

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
            const url = `/api/v1/images/${img.id}/raw`;
            return (
              <div
                key={img.id}
                className="group relative h-32 w-32 overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]"
                data-test-id={`image-${img.id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={img.filename}
                  className="h-full w-full object-cover"
                  loading="lazy"
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

      {/* moysklad parity: the add control is a plain «⊕ Изображение» button
        (no dashed drop-zone, no «Изображений нет» empty text). */}
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={triggerPicker}
        disabled={uploadMut.isPending}
        className="inline-flex items-center gap-1.5"
        data-test-id="image-upload-button"
      >
        <Icons.createCircle className="size-4 text-[var(--ms-text-brand)]" aria-hidden />
        {uploadMut.isPending ? tCommon('saving') : t('upload_button')}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
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
    </div>
  );
}
