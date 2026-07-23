import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_IMAGE_ATTR,
  MAX_IMAGE_BYTES,
  classifyImageFile,
  imageFilesFromDataTransfer,
} from './product-image';

const fileOf = (bytes: number, type: string, name = 'x') =>
  new File([new Uint8Array(bytes)], name, { type });

describe('classifyImageFile', () => {
  it('accepts a normal png/jpeg/webp/gif', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(classifyImageFile(fileOf(1000, type))).toBeNull();
    }
  });
  it('rejects a non-image / unsupported format', () => {
    expect(classifyImageFile(fileOf(1000, 'image/bmp'))).toBe('bad_format');
    expect(classifyImageFile(fileOf(1000, 'application/pdf'))).toBe('bad_format');
    expect(classifyImageFile(fileOf(1000, ''))).toBe('bad_format');
  });
  it('rejects a file over the size limit but accepts one at the limit', () => {
    expect(classifyImageFile(fileOf(MAX_IMAGE_BYTES + 1, 'image/png'))).toBe('too_large');
    expect(classifyImageFile(fileOf(MAX_IMAGE_BYTES, 'image/png'))).toBeNull();
  });
});

describe('imageFilesFromDataTransfer', () => {
  it('returns [] for null / empty clipboard', () => {
    expect(imageFilesFromDataTransfer(null)).toEqual([]);
    expect(imageFilesFromDataTransfer({ files: [], items: [] } as unknown as DataTransfer)).toEqual(
      [],
    );
  });
  it('extracts a copied image FILE from .files', () => {
    const png = fileOf(10, 'image/png', 'shot.png');
    const dt = { files: [png], items: [] } as unknown as DataTransfer;
    expect(imageFilesFromDataTransfer(dt)).toEqual([png]);
  });
  it('extracts a copied bitmap from .items (kind:file) when .files is empty', () => {
    const png = fileOf(10, 'image/png');
    const dt = {
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }],
    } as unknown as DataTransfer;
    expect(imageFilesFromDataTransfer(dt)).toEqual([png]);
  });
  it('ignores a pasted-text payload (no image → [])', () => {
    const dt = {
      files: [],
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    } as unknown as DataTransfer;
    expect(imageFilesFromDataTransfer(dt)).toEqual([]);
  });
});

describe('ACCEPTED_IMAGE_ATTR', () => {
  it('is the comma-joined MIME allow-list for the file input', () => {
    expect(ACCEPTED_IMAGE_ATTR).toBe('image/png,image/jpeg,image/webp,image/gif');
  });
});
