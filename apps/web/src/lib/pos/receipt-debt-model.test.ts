import { describe, expect, it } from 'vitest';
import { type DebtReceiptPayload, debtReceiptToSaleInput } from './receipt-debt-model';
import { RECEIPT_LABELS, buildReceiptModel } from './receipt-model';

/**
 * Qarz to'lovi cheki → TOVAR CHEKI modeli (2026-08-16, egasi).
 *
 * Ilgari qarz cheki ALOHIDA «PKO» dizaynida chiqardi va `window.open` bilan
 * ekranga ochilardi. Egasi talabi: chek TOVAR CHEKI shablonida bo'lsin
 * (sotuvchi/mijoz ismlari, tovar o'rniga «Qarz to'lovi» qatori, pastda
 * «Sizning qarzingiz» = qoldiq) va to'lov tasdiqlanishi bilan JIM chop etilsin.
 *
 * Bu mapper server cheki (`GET /debts/pos/receipt/:batchId`) javobini
 * `ReceiptSaleInput` ga o'giradi — shunda UCHALA mavjud renderer (ESC/POS ·
 * Electron HTML · brauzer TovarChek) hech qanday yangi dizayn kodisiz
 * ishlayveradi (xotira: `ombor-chek-uch-renderer`).
 */

const RECEIPT = (over: Partial<DebtReceiptPayload> = {}): DebtReceiptPayload => ({
  batchId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  counterparty: { id: 'cp-1', name: 'Alisher aka', phone: '+998901234567' },
  organization: {
    name: 'Sherset elektro tovarlar',
    legalTitle: 'MCHJ Sherset',
    phone: '+998908769900',
  },
  cashier: { id: 'u-1', name: 'Kassir Aliyev' },
  paidAt: '2026-08-15T05:30:00.000Z',
  method: 'cash',
  currency: 'UZS',
  originalMinor: null,
  exchangeRate: null,
  paidMinor: '8000000',
  outstandingAfterMinor: '4000000',
  lines: [{ debtId: 'd-1', debtName: 'QRZ-00012', amountMinor: '8000000', reversed: false }],
  ...over,
});

describe('debtReceiptToSaleInput — tovar-chek modeliga o‘tish', () => {
  it('sarlavha QARZ TO‘LOVI, raqam batch prefiksidan, sana to‘lov kunidan', () => {
    const m = buildReceiptModel(debtReceiptToSaleInput(RECEIPT()));
    expect(m.title).toBe(RECEIPT_LABELS.titleDebt);
    expect(m.title).toBe("QARZ TO'LOVI");
    expect(m.docNumber).toBe('A1B2C3D4');
    expect(m.dateLabel).toBe('15.08.2026');
  });

  it('sotuvchi = kassir, xaridor = mijoz, tashkilot nomi + telefon shapkada', () => {
    const m = buildReceiptModel(debtReceiptToSaleInput(RECEIPT()));
    expect(m.sellerName).toBe('Kassir Aliyev');
    expect(m.buyerName).toBe('Alisher aka');
    expect(m.orgName).toBe('Sherset elektro tovarlar');
    expect(m.orgPhone).toBe('+998908769900');
  });

  it('bitta qarzda qator nomi shunchaki «Qarz to‘lovi» (soni 1, narx = summa)', () => {
    const m = buildReceiptModel(debtReceiptToSaleInput(RECEIPT()));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toEqual({
      index: 1,
      name: "Qarz to'lovi",
      uom: '—',
      qty: '1',
      price: '80 000',
      sum: '80 000',
    });
    expect(m.total).toBe('80 000');
  });

  it('bir nechta qarzga bo‘linganda har qator QRZ nomi bilan (chekni tekshirsa bo‘ladi)', () => {
    const m = buildReceiptModel(
      debtReceiptToSaleInput(
        RECEIPT({
          paidMinor: '8000000',
          lines: [
            { debtId: 'd-1', debtName: 'QRZ-00012', amountMinor: '5000000', reversed: false },
            { debtId: 'd-2', debtName: 'QRZ-00013', amountMinor: '3000000', reversed: false },
          ],
        }),
      ),
    );
    expect(m.rows.map((r) => r.name)).toEqual([
      "Qarz to'lovi (QRZ-00012)",
      "Qarz to'lovi (QRZ-00013)",
    ]);
    expect(m.rows.map((r) => r.sum)).toEqual(['50 000', '30 000']);
  });

  it('storno qilingan qator chekka KIRMAYDI (jami bilan mos qolsin)', () => {
    const m = buildReceiptModel(
      debtReceiptToSaleInput(
        RECEIPT({
          paidMinor: '5000000',
          lines: [
            { debtId: 'd-1', debtName: 'QRZ-00012', amountMinor: '5000000', reversed: false },
            { debtId: 'd-2', debtName: 'QRZ-00013', amountMinor: '3000000', reversed: true },
          ],
        }),
      ),
    );
    expect(m.rows).toHaveLength(1);
    expect(m.total).toBe('50 000');
  });

  it('«Sizning qarzingiz» = to‘lovdan keyingi qoldiq va 0 bo‘lsa ham KO‘RSATILADI', () => {
    const m = buildReceiptModel(debtReceiptToSaleInput(RECEIPT()));
    expect(m.debtAfterMinor).toBe(4000000n);
    expect(m.showZeroDebt).toBe(true);
    // To'liq yopilgan qarz: 0 — «qarz tugadi» dalili, qator yo'qolmasin.
    const m0 = buildReceiptModel(debtReceiptToSaleInput(RECEIPT({ outstandingAfterMinor: '0' })));
    expect(m0.debtAfterMinor).toBe(0n);
    expect(m0.showZeroDebt).toBe(true);
  });

  it('oddiy savdo chekida showZeroDebt YO‘Q (0 qarz qatori chizilmaydi, eski xulq)', () => {
    const m = buildReceiptModel({
      name: '00025',
      moment: '2026-07-22T09:15:00.000Z',
      sumMinor: '100',
      cashAmountMinor: '0',
      cardAmountMinor: '0',
      changeMinor: '0',
      description: null,
      agent: null,
      session: {
        cashier: { name: 'K' },
        organization: { name: 'O', legalTitle: null },
      },
      positions: [],
    });
    expect(m.showZeroDebt).toBe(false);
  });

  it('naqd so‘m to‘lovi «Naqd» qatori bilan', () => {
    const m = buildReceiptModel(debtReceiptToSaleInput(RECEIPT()));
    expect(m.payments).toEqual([{ label: 'Naqd', value: '80 000', note: null }]);
  });

  it('terminal to‘lovi «Terminal» qatori bilan', () => {
    const m = buildReceiptModel(debtReceiptToSaleInput(RECEIPT({ method: 'terminal' })));
    expect(m.payments).toEqual([{ label: 'Terminal', value: '80 000', note: null }]);
  });

  it('dollar to‘lovida ASL summa + MUZLATILGAN kurs + so‘m ekvivalenti', () => {
    const m = buildReceiptModel(
      debtReceiptToSaleInput(
        RECEIPT({
          currency: 'USD',
          originalMinor: '10000',
          exchangeRate: '1245027000000',
          paidMinor: '124502700',
          outstandingAfterMinor: '0',
          lines: [
            { debtId: 'd-1', debtName: 'QRZ-00012', amountMinor: '124502700', reversed: false },
          ],
        }),
      ),
    );
    expect(m.payments).toEqual([
      {
        label: 'Dollar',
        value: '$100.00',
        note: { left: '1USD = 12450.27', right: '1 245 027' },
      },
    ]);
  });

  it('kurs yo‘q buzuq USD qatorida chek YO‘QOLMAYDI (so‘m qiymati bosiladi)', () => {
    const m = buildReceiptModel(
      debtReceiptToSaleInput(
        RECEIPT({ currency: 'USD', originalMinor: '10000', exchangeRate: null }),
      ),
    );
    expect(m.payments).toHaveLength(1);
    expect(m.payments[0]?.note).toBeNull();
    expect(m.payments[0]?.value).toBe('80 000');
  });

  it('kassir/mijoz/tashkilot yo‘q chala chekda ham yiqilmaydi (tire)', () => {
    const m = buildReceiptModel(
      debtReceiptToSaleInput(
        RECEIPT({ cashier: null, counterparty: null, organization: null, paidAt: null }),
      ),
    );
    expect(m.sellerName).toBe('—');
    expect(m.buyerName).toBe('—');
    expect(m.dateLabel).toBe('—');
  });
});
