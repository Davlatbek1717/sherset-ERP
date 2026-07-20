import { describe, expect, it } from 'vitest';
import { mediaKindFromFlags, olderCursor } from './backfill-plan.util.js';

describe('mediaKindFromFlags — media-borligi bayroqlaridan kind (sof)', () => {
  it("photo bayrog'i → photo", () => {
    expect(mediaKindFromFlags({ photo: true })).toBe('photo');
  });
  it('voice → voice, video → video, document → document', () => {
    expect(mediaKindFromFlags({ voice: true })).toBe('voice');
    expect(mediaKindFromFlags({ video: true })).toBe('video');
    expect(mediaKindFromFlags({ document: true })).toBe('document');
  });
  it('hech qanday media → text', () => {
    expect(mediaKindFromFlags({})).toBe('text');
  });
  it('photo boshqalardan ustun (bir nechta bayroq)', () => {
    expect(mediaKindFromFlags({ photo: true, document: true })).toBe('photo');
  });
});

describe('olderCursor — sahifadagi eng kichik tgMessageId (orqaga sahifalash)', () => {
  it('eng kichik id ni qaytaradi', () => {
    expect(olderCursor([{ tgMessageId: 40 }, { tgMessageId: 12 }, { tgMessageId: 33 }])).toBe(12);
  });
  it('bitta element', () => {
    expect(olderCursor([{ tgMessageId: 7 }])).toBe(7);
  });
  it("bo'sh sahifa → null", () => {
    expect(olderCursor([])).toBeNull();
  });
});
