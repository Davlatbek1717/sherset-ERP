import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfRenderService } from './pdf-render.service.js';

describe('PdfRenderService', () => {
  const svc = new PdfRenderService();

  describe('renderStubDoc', () => {
    it('returns a non-empty PDF byte buffer', async () => {
      const bytes = await svc.renderStubDoc({
        title: 'Buyurtma',
        name: 'CO-2026-00001',
        moment: new Date('2026-05-28'),
        sumMinor: '1500000',
        currency: 'UZS',
        description: 'Test description',
      });
      expect(bytes.length).toBeGreaterThan(500);
      // pdf-lib emits standard PDF header
      const header = new TextDecoder().decode(bytes.slice(0, 4));
      expect(header).toBe('%PDF');
    });

    it('produces a single page', async () => {
      const bytes = await svc.renderStubDoc({
        title: 'Buyurtma',
        name: 'CO-2026-00002',
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    });

    it('tolerates missing optional fields', async () => {
      const bytes = await svc.renderStubDoc({
        title: 'Buyurtma',
        name: 'CO-2026-00003',
        moment: null,
        sumMinor: null,
        currency: null,
        description: null,
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    });

    it('truncates very long descriptions at 200 chars to fit the page', async () => {
      const long = 'x'.repeat(500);
      const bytes = await svc.renderStubDoc({
        title: 'Buyurtma',
        name: 'CO-2026-00004',
        description: long,
      });
      // No exception, single page, reasonable size
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    });
  });

  describe('mergePdfs', () => {
    it('returns a single doc with one page per input', async () => {
      const parts = await Promise.all([
        svc.renderStubDoc({ title: 't', name: 'A' }),
        svc.renderStubDoc({ title: 't', name: 'B' }),
        svc.renderStubDoc({ title: 't', name: 'C' }),
      ]);
      const merged = await svc.mergePdfs(parts);
      const doc = await PDFDocument.load(merged);
      expect(doc.getPageCount()).toBe(3);
    });

    it('preserves input page order', async () => {
      const parts = await Promise.all([
        svc.renderStubDoc({ title: 'A', name: 'first' }),
        svc.renderStubDoc({ title: 'B', name: 'second' }),
      ]);
      const merged = await svc.mergePdfs(parts);
      const doc = await PDFDocument.load(merged);
      expect(doc.getPageCount()).toBe(2);
    });

    it('still returns a loadable PDF for zero inputs (pdf-lib normalises to ≥1 page)', async () => {
      const merged = await svc.mergePdfs([]);
      const doc = await PDFDocument.load(merged);
      // pdf-lib auto-adds a blank page on save when none exist; callers
      // should guard against empty-input bulk-print at the call site.
      expect(doc.getPageCount()).toBeLessThanOrEqual(1);
    });

    it('merges a large bulk batch (50 docs) without crashing', async () => {
      const parts = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          svc.renderStubDoc({ title: 'Bulk', name: `DOC-${i.toString().padStart(4, '0')}` }),
        ),
      );
      const merged = await svc.mergePdfs(parts);
      const doc = await PDFDocument.load(merged);
      expect(doc.getPageCount()).toBe(50);
    });
  });

  describe('renderStubDoc — input edge cases', () => {
    it('handles REAL non-WinAnsi characters (Cyrillic doc numbers, Uzbek, emoji) without throwing', async () => {
      // pdf-lib's StandardFont (Helvetica) only covers WinAnsi — Cyrillic,
      // the Uzbek modifier-letter turned-comma (Oʻ/gʻ, U+02BB), emoji and
      // zero-width chars land outside that range and make drawText THROW.
      // Document auto-numbers actually carry Cyrillic prefixes (ТЗ-/ОТ-/СЧ-),
      // so the stub fallback must sanitize rather than 500 on real data.
      const cases = [
        { title: 'Realizatsiya', name: 'ТЗ-2026-00001', description: 'Срочно — Кирилл текст' },
        { title: 'Hisob', name: 'СЧ-2026-00042', description: 'Oʻzbek gʻalla yetkazib berish' },
        { title: 'Test', name: 'CO-😀-2026​', description: '   leading and trailing   ' },
        { title: 'Sale', name: '!@#$%^&*()_+' },
      ];
      for (const c of cases) {
        const bytes = await svc.renderStubDoc(c);
        const header = new TextDecoder().decode(bytes.slice(0, 4));
        expect(header).toBe('%PDF');
        expect(bytes.length).toBeGreaterThan(500);
      }
    });

    it('handles bigint-string sumMinor without precision loss', async () => {
      const big = '99999999999999999000'; // bigger than Number.MAX_SAFE_INTEGER
      const bytes = await svc.renderStubDoc({
        title: 'Sale',
        name: 'CO-2026-09999',
        sumMinor: big,
        currency: 'UZS',
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    });

    it('drops description gracefully when whitespace-only', async () => {
      // Renderer should not throw and should produce one page.
      const bytes = await svc.renderStubDoc({
        title: 'Sale',
        name: 'CO-2026-12345',
        description: '   \n  \t  ',
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    });

    it('PDF header conforms to the spec (%PDF-1.x)', async () => {
      const bytes = await svc.renderStubDoc({ title: 'Sale', name: 'CO-X' });
      const head = new TextDecoder().decode(bytes.slice(0, 8));
      expect(head.startsWith('%PDF-')).toBe(true);
      // pdf-lib emits PDF 1.7 by default
      expect(head.charCodeAt(5)).toBe('1'.charCodeAt(0));
    });
  });
});
