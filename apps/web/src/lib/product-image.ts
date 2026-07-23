/**
 * Shared product-image upload rules + clipboard helpers.
 *
 * Used by BOTH image-entry paths so they behave identically (user 2026-07-06 —
 * clipboard-paste feature): the edit-side `ImageGallery` (immediate upload) and
 * the create-side staging in `product-form-left-cards`. Whether an image comes
 * from a file picker or from Ctrl+V, it must pass the SAME size/format limits
 * and end up as the SAME base64 payload — this module is the single source of
 * those rules so the two callers can never drift apart.
 */

/** Max accepted image size (matches the server-side product-image limit). */
export const MAX_IMAGE_BYTES = 4_000_000;

/** Max images per product (small moysklad-style gallery; user 2026-07-07).
 *  Enforced on BOTH entry paths (file picker + Ctrl+V/«Вставить») AND on the
 *  server (image.service.upload) so a bypassed client can't exceed it. */
export const MAX_IMAGES = 5;

/**
 * Cap an incoming image batch to the slots left under {@link MAX_IMAGES}, given
 * how many the product/staging already holds. Returns the files that fit +
 * whether any were dropped (so the caller can surface a «max reached» message).
 */
export function capImagesToLimit(
  currentCount: number,
  files: File[],
): { accepted: File[]; overflow: boolean } {
  const remaining = Math.max(0, MAX_IMAGES - currentCount);
  const accepted = files.slice(0, remaining);
  return { accepted, overflow: files.length > accepted.length };
}

/** Accepted MIME types (also the file-input `accept` attribute, below). */
export const ACCEPTED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** `accept="…"` string for the hidden `<input type=file>` (same set as paste). */
export const ACCEPTED_IMAGE_ATTR = ACCEPTED_IMAGE_MIMES.join(',');

/** Why an image was rejected — mapped to a localized message by the caller. */
export type ImageReject = 'too_large' | 'bad_format';

/** Validate one image File against the shared limits. `null` ⇒ OK. */
export function classifyImageFile(file: File): ImageReject | null {
  if (!(ACCEPTED_IMAGE_MIMES as readonly string[]).includes(file.type)) return 'bad_format';
  if (file.size > MAX_IMAGE_BYTES) return 'too_large';
  return null;
}

/**
 * Extract image File(s) from a paste/drop `DataTransfer` — handles both a copied
 * image FILE (rides `.files`) and a copied bitmap/screenshot (rides `.items` as
 * a `kind:'file'` entry). Non-image payloads yield an empty array, so a text
 * paste is silently ignored.
 */
export function imageFilesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const files: File[] = [];
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/')) files.push(f);
  }
  if (files.length === 0) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  }
  return files;
}

/**
 * Read image File(s) from the async Clipboard API — the explicit «Вставить»
 * button path (a user gesture is required for `clipboard.read()`). Returns `[]`
 * when the clipboard holds no image or the API is unavailable, so the caller can
 * show a «no image in clipboard» message.
 */
export async function readClipboardImageFiles(): Promise<File[]> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clip?.read) return [];
  const items = await clip.read();
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    const ext = type.split('/')[1] ?? 'png';
    files.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type }));
  }
  return files;
}

/** File → data URL (base64). The exact payload shape both upload paths POST. */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('read'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}
