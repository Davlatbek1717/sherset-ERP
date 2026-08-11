import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * F6 §7 — AUDIT TOPILMASI: VALYUTALI KASSA (`CashDesk.currency ≠ UZS`).
 *
 * TUZATISHDAN OLDINGI holat (o'lchangan, reja §F6.7):
 *   · `drawerCashIn`/`drawerCashOut`/`posCashOut` hujjatga KASSA valyutasini
 *     yozadi (`currency: session.cashDesk.currency`);
 *   · `collectCashInputs` esa `RetailDrawerCashIn/Out` yig'indisini valyuta
 *     bo'yicha FILTRLAMAYDI ⇒ dollar-kassada sent so'm formulasiga qo'shilib,
 *     kutilgan naqdni jimgina buzardi (1 sent = 1 tiyin deb).
 *
 * Yechim IKKI qatlamli:
 *  1. **Agregatlarga valyuta filtri** — hisob so'm hujjatlaridan yig'iladi
 *     (bugungi bazada hammasi UZS, ya'ni xulq o'zgarmaydi);
 *  2. **OCHIQ XATO bilan bloklash** — so'm bo'lmagan kassada yashiq amali
 *     umuman boshlanmaydi. Smena hisobining butun oqimi (opening/sales/
 *     expected/variance) so'm semantikasida, ya'ni USD-kassa QO'LLAB-
 *     QUVVATLANMAYDI. Jim noto'g'ri hisobdan ko'ra ochiq to'xtash yaxshi.
 */
const SERVICE = readFileSync(join(import.meta.dirname, 'cashier-session.service.ts'), 'utf8');

function cashInputsBody(): string {
  const start = SERVICE.indexOf('private async collectCashInputs');
  expect(start, 'collectCashInputs topilmadi').toBeGreaterThan(-1);
  const end = SERVICE.indexOf('\n  /**', start);
  return SERVICE.slice(start, end === -1 ? SERVICE.length : end);
}

describe('F6 §7 — yashiq hujjatlari valyuta bo`yicha ajratilgan', () => {
  it('Внесение agregati so`m hujjatlari bilan cheklangan', () => {
    const body = cashInputsBody();
    const agg = body.slice(body.indexOf('retailDrawerCashIn.aggregate'));
    expect(agg.slice(0, 400)).toContain('currency: BASE_CURRENCY');
  });

  it('Изъятие/xarajat/inkassatsiya agregati ham so`m bilan cheklangan', () => {
    const body = cashInputsBody();
    const agg = body.slice(body.indexOf('retailDrawerCashOut.aggregate'));
    expect(agg.slice(0, 400)).toContain('currency: BASE_CURRENCY');
  });

  it('`kind` bo`yicha filtr HAMON yo`q (§8.2 regressiyasi qaytmasin)', () => {
    const body = cashInputsBody();
    const agg = body.slice(body.indexOf('retailDrawerCashOut.aggregate'));
    expect(agg.slice(0, 400)).not.toMatch(/kind\s*:/);
  });
});

/** Yashiq amallari uchun umumiy qo'riqchi — bitta joyda (uch chaqiruvchi). */
function makeService(cashDeskCurrency: string) {
  const session = {
    id: 'sess-1',
    state: 'open',
    cashierId: 'cashier-1',
    organizationId: 'org-1',
    openingCashMinor: 0n,
    cashDesk: { currency: cashDeskCurrency },
  };
  const client = {
    cashierSession: { findFirst: async () => session },
  };
  return new CashierSessionService({ client } as never);
}

describe('F6 §7 — so`m bo`lmagan kassada yashiq amali OCHIQ xato bilan to`xtaydi', () => {
  it('USD kassada Внесение bloklanadi', async () => {
    const svc = makeService('USD');
    await expect(
      svc.drawerCashIn('acc-1', 'cashier-1', 'sess-1', { sumMinor: '1000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('USD kassada Изъятие ham bloklanadi (bitta qo`riqchi, uch chaqiruvchi)', async () => {
    const svc = makeService('USD');
    await expect(
      svc.drawerCashOut('acc-1', 'cashier-1', 'sess-1', { sumMinor: '1000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('xato matni SABABNI aytadi (kassa valyutasi) — jim 400 emas', async () => {
    const svc = makeService('USD');
    await expect(
      svc.drawerCashIn('acc-1', 'cashier-1', 'sess-1', { sumMinor: '1000' }),
    ).rejects.toThrow(/USD/);
  });

  it('so`m kassada qo`riqchi TO`SMAYDI (vacuity tekshiruvi)', async () => {
    const svc = makeService('UZS');
    // Bu yerda double faqat `cashierSession.findFirst` ni biladi — qo'riqchi
    // o'tsa keyingi qadam (hujjat raqami) boshqa xato beradi. MUHIMI: xato
    // «kassa valyutasi» sababli EMAS.
    await expect(
      svc.drawerCashIn('acc-1', 'cashier-1', 'sess-1', { sumMinor: '1000' }),
    ).rejects.not.toThrow(/valyuta/i);
  });
});
