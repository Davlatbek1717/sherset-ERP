/**
 * E2E: mijoz-ekran (CFD) sahnasi HAR QANDAY ekranga sig'adimi.
 *
 * ── Nega bu test bor (2026-09-01 regressiyasi) ──────────────────────────────
 * Ekran 1920×1080 «sahna» qilib qurilgan va `transform: scale()` bilan
 * televizorga moslashtiriladi. Birinchi ijroda markazlashtirish `grid
 * place-items-center` bilan qilingan edi va bu NOTO'G'RI: `scale()` elementning
 * LAYOUT o'lchamini o'zgartirmaydi, grid esa konteynerdan katta elementni
 * markazlashtira olmay `(0,0)` ga qo'yadi; sukutdagi `transform-origin`
 * (element markazi) esa vizual qutini o'ngga-pastga surib yuboradi.
 *
 * Jonli natija: 1536×864 televizorda (1920×1080 @ Windows 125%) dizaynning
 * ~24% i ekrandan tashqarida qoldi — o'ng tomon va past kesildi. Nuqson
 * prod'ga chiqdi, chunki barcha qo'lda sinovlar AYNAN 1920×1080 da qilingan
 * edi — bu nuqson matematik jihatdan ko'rinmaydigan YAGONA o'lcham (scale=1).
 *
 * Shuning uchun bu test bitta o'lchamni emas, DIAPAZONNI tekshiradi va
 * 1920×1080 ataylab ro'yxatning O'RTASIDA turadi — u yolg'iz o'zi hech narsa
 * isbotlamaydi.
 */
import { expect, test } from '@playwright/test';

/** Sahna maketi — `customer-display/page.tsx` dagi STAGE_W/STAGE_H bilan bir xil. */
const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * Sinaladigan ekranlar. Har biri REAL holat, taxminiy emas:
 *  · 1920×1080 — Windows masshtabi 100% (maketning o'zi)
 *  · 1536×864  — masshtab 125% (egasining televizori, 2026-09-01 da o'lchandi)
 *  · 1280×720  — masshtab 150%
 *  · 1366×768  — eski televizor / noutbuk paneli
 *  · 3840×2160 — 4K, masshtab 100% (sahna KATTALASHISHI kerak)
 *  · 1500×550  — brauzer oynasi: keng va past, nisbat 16:9 EMAS
 *  · 1024×1000 — tor va baland, nisbat teskari tomonga buzilgan
 */
const VIEWPORTS: Array<{ w: number; h: number; izoh: string }> = [
  { w: 1536, h: 864, izoh: '125% masshtab — egasining televizori' },
  { w: 1280, h: 720, izoh: '150% masshtab' },
  { w: 1920, h: 1080, izoh: '100% masshtab — maketning o‘zi' },
  { w: 1366, h: 768, izoh: 'eski panel' },
  { w: 3840, h: 2160, izoh: '4K — sahna kattalashadi' },
  { w: 1500, h: 550, izoh: 'brauzer oynasi — keng va past' },
  { w: 1024, h: 1000, izoh: 'tor va baland' },
];

test.describe('Mijoz-ekran — sahna ekranga sig‘adi', () => {
  for (const { w, h, izoh } of VIEWPORTS) {
    test(`${w}x${h} (${izoh})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      // `?demo=1` — autentifikatsiyasiz ishlaydi va savat/navbat to'la bo'ladi,
      // ya'ni eng ko'p joy egallaydigan holat sinaladi.
      await page.goto('/customer-display?demo=1');

      const stage = page.locator('.cfd-theme > div').first();
      await expect(stage).toBeVisible();

      const m = await page.evaluate(() => {
        const el = document.querySelector('.cfd-theme > div');
        if (!el) throw new Error('sahna topilmadi');
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });

      // 1 px — yaxlitlash uchun bag'rikenglik.
      const T = 1;

      // (a) Sahna ekrandan CHIQMAYDI — regressiyaning o'zi shu yerda edi.
      expect(m.left, 'chapdan chiqib ketdi').toBeGreaterThanOrEqual(-T);
      expect(m.top, 'yuqoridan chiqib ketdi').toBeGreaterThanOrEqual(-T);
      expect(m.right, 'o‘ngdan chiqib ketdi').toBeLessThanOrEqual(m.vw + T);
      expect(m.bottom, 'pastdan chiqib ketdi').toBeLessThanOrEqual(m.vh + T);

      // (b) Markazda turadi — bo'sh joy ikki tomonda TENG taqsimlanadi,
      //     ya'ni chapdagi bo'shliq umumiy bo'shliqning YARMI.
      expect(Math.abs(m.left - (m.vw - m.width) / 2), 'gorizontal markaz').toBeLessThanOrEqual(
        2 * T,
      );
      expect(Math.abs(m.top - (m.vh - m.height) / 2), 'vertikal markaz').toBeLessThanOrEqual(2 * T);

      // (c) Nisbat saqlanadi — dizayn cho'zilmaydi/siqilmaydi.
      expect(m.width / m.height).toBeCloseTo(STAGE_W / STAGE_H, 2);

      // (d) Ekranning bir o'lchami TO'LIQ ishlatiladi (letterbox faqat bir o'qda).
      const fillsW = Math.abs(m.width - m.vw) <= 2 * T;
      const fillsH = Math.abs(m.height - m.vh) <= 2 * T;
      expect(fillsW || fillsH, 'sahna ekranga maksimal sig‘magan').toBe(true);
    });
  }
});
