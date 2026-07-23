import { z } from 'zod';

/**
 * ProductImage upload — accepts a base64-encoded data URL or a raw
 * base64 payload. Decoded server-side to a Buffer and stored in the
 * `content` bytea column.
 *
 * Encoded-payload cap sized so the client's 4 MB raw-file limit always fits:
 * base64 inflates by ~4/3, so a 4 MB image encodes to ≈ 5.34 MB — the 6 MB cap
 * clears that with margin (the FE `classifyImageFile` gate at 4 MB raw is the
 * real user-facing limit; this is the matching server backstop).
 */

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const UploadImageSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(ALLOWED_MIME),
  /**
   * Either a `data:image/png;base64,xxx` URL or just the base64 body.
   * Validated as <= 6 MB encoded (≈ 4.5 MB binary); decoded by the service.
   */
  dataBase64: z.string().min(1).max(6_000_000, 'Rasm hajmi 4 MB dan oshmasligi kerak'),
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
