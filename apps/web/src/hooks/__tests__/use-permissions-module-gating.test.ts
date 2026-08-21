import { MODULE_ENTITIES } from '@/hooks/use-permissions';
import { describe, expect, it } from 'vitest';

/**
 * Yuqori menyu qaysi modulni ko'rsatishi (`layout.tsx` → `canSeeModule`).
 *
 * 🔴 2026-08-21, egasi o'lchagan hodisa: B2B/B2G sotuvchi rolida menyuda
 * HAMMA bo'lim turardi. Ikki sabab bor edi — biri rol matritsasi (shablon
 * sukuti `view: ALL`, prodda tuzatildi), ikkinchisi SHU YERDA: `hr` va
 * `menejer` ning entity ro'yxati BO'SH edi, ya'ni «har doim ko'rinadi».
 * Bo'sh ro'yxat = gating YO'Q: rolda hech qanday HR ruxsati bo'lmasa ham
 * bo'lim menyuda turaverardi va bosilganda 403 berardi.
 *
 * Server tomoni bu ikkalasini AYNAN bir narsa bilan qo'riqlaydi:
 * `@RequireHrPermission('employees', …)` — `manager` modulida 42 marshrut,
 * HR modulida ham shu. Shuning uchun menyu ham `hremployee` ga bog'lanadi.
 *
 * Prod o'lchovi (2026-08-21) — bu o'zgarish hech bir rolni yo'qotmaydi:
 *   AccountOwner · Administrator · Manager · ReadOnly → hremployee = ALL
 *   Employee → OWN_GROUP (NO emas ⇒ ko'rinadi)
 *   B2B/B2G sotuvchi → qator yo'q ⇒ yashiriladi (KUTILGAN)
 *   Kassir · PointOfSale → kiosk, yuqori menyusi umuman yo'q
 */
describe('MODULE_ENTITIES — hr va menejer gating', () => {
  it('hr moduli HR ruxsatlariga bog\u2018langan (bo\u2018sh emas)', () => {
    expect((MODULE_ENTITIES.hr ?? []).length).toBeGreaterThan(0);
    expect(MODULE_ENTITIES.hr).toContain('hremployee');
  });

  it('menejer moduli ham hremployee ga bog\u2018langan (server bilan bir xil)', () => {
    expect(MODULE_ENTITIES.menejer).toEqual(['hremployee']);
  });

  it('hr ro\u2018yxatidagi har entity hr- prefiksli (boshqa modulni tortib kelmasin)', () => {
    for (const e of MODULE_ENTITIES.hr ?? []) expect(e.startsWith('hr'), e).toBe(true);
  });

  it('ataylab GATING YO\u2018Q qoladigan modullar aynan shu ikkitasi', () => {
    const gatesiz = Object.entries(MODULE_ENTITIES)
      .filter(([, v]) => v.length === 0)
      .map(([k]) => k)
      .sort();
    // `homepage` — bosh sahifa, `apps` — yechimlar do'koni: ikkalasi ham
    // ma'lumot ko'rsatmaydi, shuning uchun ruxsatga bog'lanmaydi.
    expect(gatesiz).toEqual(['apps', 'homepage']);
  });
});
