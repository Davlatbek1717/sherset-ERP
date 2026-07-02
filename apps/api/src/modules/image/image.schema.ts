import { z } from 'zod';

/**
 * ProductImage upload — accepts a base64-encoded data URL or a raw
 * base64 payload. Decoded server-side to a Buffer and stored in the
 * `content` bytea column.
 *
 * 5 MB hard cap on encoded payload (≈ 3.7 MB binary) — sized for
 * product photos taken by staff phones, not full-quality scans.
 */

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const UploadImageSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(ALLOWED_MIME),
  /**
   * Either a `data:image/png;base64,xxx` URL or just the base64 body.
   * Validated as <= 5 MB encoded; decoded by the service.
   */
  dataBase64: z.string().min(1).max(5_242_880, 'Rasm hajmi 5 MB dan oshmasligi kerak'),
  /** Mark this image as the new main one (replaces the previous main). */
  isMain: z.boolean().default(false),
  /** Display position; defaults to the next available index. */
  position: z.coerce.number().int().min(0).optional(),
});
export type UploadImageInput = z.infer<typeof UploadImageSchema>;

export const ReorderImagesSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1).max(50),
});
export type ReorderImagesInput = z.infer<typeof ReorderImagesSchema>;
