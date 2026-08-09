import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE↔BE kontrakt qulfi — «Прибыльность» kassir kesimi (analitika TZ §9 X2,
 * faza F010).
 *
 * Hisobotda xodim kesimi hujjat EGASI (`owner_id`) bo'yicha ketardi; chekni
 * KIM urgani (`cashier_sessions.cashier_id`) esa umuman yo'q edi. Ikkalasi
 * alohida savol va ikkalasi ham kerak — shuning uchun bu yerda ikkita narsa
 * qulflanadi:
 *
 *   1. API'da IKKALA kesim ham bor (biri ikkinchisini almashtirmagan);
 *   2. sahifadagi «noma'lum kassir» kaliti API'dagi sentinel bilan AYNAN bir
 *      xil. Sahifa uni qo'lda yozadi (bu fayldagi boshqa enumlar kabi) —
 *      shuning uchun ikki manba shu test orqali bog'lanadi, aks holda kalit
 *      o'zgarsa ekranda pul egasiz «—» qatorida qolib ketardi.
 */

const PAGE = join(__dirname, '..', 'app', '(app)', 'reports', 'profitability', 'page.tsx');
const apiDir = join(__dirname, '..', '..', '..', '..', 'apps', 'api', 'src', 'modules', 'report');
const API_SERVICE = join(apiDir, 'profitability.service.ts');
const API_METRIC = join(apiDir, 'metrics', 'cashier-slice.ts');

describe('Profitability — kassir kesimi FE↔BE', () => {
  const page = readFileSync(PAGE, 'utf8');
  const api = readFileSync(API_SERVICE, 'utf8');
  const metric = readFileSync(API_METRIC, 'utf8');

  it('API ikkala kesimni ham beradi: ega (employee) VA kassir (cashier)', () => {
    const enumSlice = api.slice(api.indexOf('groupBy: z'), api.indexOf('dateFrom'));
    expect(enumSlice).toContain("'employee'");
    expect(enumSlice).toContain("'cashier'");
  });

  it('sahifa kassir tab`ini beradi va API qiymatini yuboradi', () => {
    expect(page).toMatch(/type GroupBy =[^;]*'cashier'/);
    expect(page).toContain("['cashier', t('tab_by_cashiers')]");
  });

  it('sahifadagi «noma`lum kassir» kaliti API sentineli bilan bir xil', () => {
    const apiSentinel = /UNKNOWN_CASHIER_ID = '([^']+)'/.exec(metric)?.[1];
    expect(apiSentinel, 'API sentineli topilmadi — kesim manbasi o`zgargan').toBeTruthy();
    expect(page).toContain(`'${apiSentinel}'`);
  });

  it('«noma`lum» qator tarjima qilingan matn bilan chiqadi, quruq «—» emas', () => {
    expect(page).toContain("t('row_cashier_unknown')");
  });
});
