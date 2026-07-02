import { describe, expect, it } from 'vitest';
import { ReorderImagesSchema, UploadImageSchema } from './image.schema.js';

const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

describe('UploadImageSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = UploadImageSchema.safeParse({
      filename: 'photo.png',
      mime: 'image/png',
      dataBase64: tinyPng,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isMain).toBe(false);
  });

  it('accepts data URL prefix', () => {
    const r = UploadImageSchema.safeParse({
      filename: 'photo.png',
      mime: 'image/png',
      dataBase64: `data:image/png;base64,${tinyPng}`,
    });
    expect(r.success).toBe(true);
  });

  it('rejects unsupported MIME', () => {
    expect(
      UploadImageSchema.safeParse({
        filename: 'doc.pdf',
        mime: 'application/pdf',
        dataBase64: tinyPng,
      }).success,
    ).toBe(false);
  });

  it('rejects payload over 5 MB encoded', () => {
    const huge = 'A'.repeat(5_242_881);
    expect(
      UploadImageSchema.safeParse({
        filename: 'big.png',
        mime: 'image/png',
        dataBase64: huge,
      }).success,
    ).toBe(false);
  });

  it('rejects empty filename', () => {
    expect(
      UploadImageSchema.safeParse({
        filename: '',
        mime: 'image/png',
        dataBase64: tinyPng,
      }).success,
    ).toBe(false);
  });

  it('coerces position from string', () => {
    const r = UploadImageSchema.safeParse({
      filename: 'p.png',
      mime: 'image/png',
      dataBase64: tinyPng,
      position: '3',
    });
    if (!r.success) throw r.error;
    expect(r.data.position).toBe(3);
  });
});

describe('ReorderImagesSchema', () => {
  it('accepts a non-empty list of UUIDs', () => {
    expect(
      ReorderImagesSchema.safeParse({
        imageIds: [crypto.randomUUID(), crypto.randomUUID()],
      }).success,
    ).toBe(true);
  });

  it('rejects empty list', () => {
    expect(ReorderImagesSchema.safeParse({ imageIds: [] }).success).toBe(false);
  });

  it('rejects > 50 items', () => {
    const ids = Array.from({ length: 51 }, () => crypto.randomUUID());
    expect(ReorderImagesSchema.safeParse({ imageIds: ids }).success).toBe(false);
  });

  it('rejects non-UUID entry', () => {
    expect(
      ReorderImagesSchema.safeParse({
        imageIds: ['not-a-uuid'],
      }).success,
    ).toBe(false);
  });
});
