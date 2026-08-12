/**
 * P7 — chop zanjiri QAYSI qavatda uzilganini aytadi.
 *
 * Ilgari uchala uzilish ham bir xil `{ handled:false, ok:false }` qaytarardi:
 * agent yo'qmi, printer sozlanmaganmi, ma'lumot yuklanmadimi — chaqiruvchi
 * ajrata olmasdi va hammasiga bitta javob berardi (brauzer popup'i).
 * Qobiq ichida o'sha popup Chromium tasdiq oynasini chiqaradi — egasi ko'rgan
 * simptom aynan shu. `reason` shu ajratishni beradi.
 */

import { api } from '@/lib/api-client';
import { printReceiptViaAgent, printZReportViaAgent } from '@/lib/print-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const LABELS = {
  title: 'Z',
  shift: 'Smena',
  cashier: 'Kassir',
  opened: 'Ochildi',
  closed: 'Yopildi',
} as unknown as Parameters<typeof printZReportViaAgent>[1];

/**
 * Qobiq (Electron) ko'prigini o'rnatadi — `printSheet` jim chop qiladi.
 *
 * `version` sukut bo'yicha ESKI (`1.3.0`): B2 versiya darvozasi shu qiymatda
 * yopiq qoladi, ya'ni bu yordamchini argumentsiz chaqiradigan MAVJUD testlar
 * aynan hozirgi yo'lni (sozlamani o'qish) tekshirishda davom etadi.
 */
function installShell(
  version = '1.3.0',
  // Parametrlar ataylab tiplangan: `printSheet.mock.calls[0][0]` (qaysi printer
  // nomi uzatildi) shusiz tipsiz bo'sh kortej bo'lib qoladi.
  printSheet = vi.fn(async (_printerName: string, _html: string) => ({ ok: true })),
) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    isSherset: true,
    version,
    listPrinters: async () => ['XP-80C'],
    printSheet,
  };
  return printSheet;
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

afterEach(() => {
  (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  vi.unstubAllGlobals();
});

describe('printReceiptViaAgent — uzilish sababi', () => {
  it('qobiq bor, printer sozlanmagan ⇒ reason=printer-not-set', async () => {
    installShell();
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url.startsWith('/sklad-keepers') ? { receiptPrinterName: null } : { name: 'CHEK-1' },
    );

    const r = await printReceiptViaAgent('s-1');
    expect(r).toMatchObject({ handled: false, reason: 'printer-not-set' });
  });

  it('agent ham, qobiq ham yo‘q ⇒ reason=no-agent (so‘rov ham yuborilmaydi)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const r = await printReceiptViaAgent('s-1');
    expect(r).toMatchObject({ handled: false, reason: 'no-agent' });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('ma’lumot yuklanmadi ⇒ reason=load-failed', async () => {
    installShell();
    vi.mocked(api.get).mockRejectedValue(new Error('500'));

    const r = await printReceiptViaAgent('s-1');
    expect(r).toMatchObject({ handled: false, reason: 'load-failed' });
  });

  it('printer sozlangan ⇒ JIM chop, reason yo‘q', async () => {
    const printSheet = installShell();
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url.startsWith('/sklad-keepers')
        ? { receiptPrinterName: 'XP-80C' }
        : {
            name: 'CHEK-1',
            moment: '2026-08-11T10:00:00.000Z',
            sumMinor: '1000',
            cashAmountMinor: '1000',
            cardAmountMinor: '0',
            changeMinor: '0',
            description: null,
            agent: null,
            session: {
              cashDesk: { name: 'Kassa' },
              cashier: { name: 'Kassir' },
              store: null,
              organization: { name: 'Org', legalTitle: null },
            },
            positions: [],
          },
    );

    const r = await printReceiptViaAgent('s-1');
    expect(r).toMatchObject({ handled: true, ok: true });
    expect(r.reason).toBeUndefined();
    expect(printSheet).toHaveBeenCalledWith('XP-80C', expect.stringContaining('CHEK-1'));
  });

  it('B2 — yangi qobiq (1.4.0): sozlama O`QILMAYDI, bo`sh nom bilan bosiladi', async () => {
    const printSheet = installShell('1.4.0');
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      // 🔴 `/sklad-keepers` bu yo'lda umuman chaqirilmasligi kerak.
      if (url.startsWith('/sklad-keepers')) throw new Error('sklad-keepers chaqirildi');
      return {
        name: 'CHEK-1',
        moment: '2026-08-11T10:00:00.000Z',
        sumMinor: '1000',
        cashAmountMinor: '1000',
        cardAmountMinor: '0',
        changeMinor: '0',
        description: null,
        agent: null,
        session: {
          cashDesk: { name: 'Kassa' },
          cashier: { name: 'Kassir' },
          store: null,
          organization: { name: 'Org', legalTitle: null },
        },
        positions: [],
      };
    });

    const r = await printReceiptViaAgent('s-1');

    expect(r.handled).toBe(true);
    expect(printSheet).toHaveBeenCalledTimes(1);
    expect(printSheet.mock.calls[0]?.[0]).toBe('');
  });

  it('B2 — eski qobiq (1.3.0): eski yo`l AYNAN saqlanadi', async () => {
    installShell('1.3.0');
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url.startsWith('/sklad-keepers') ? { receiptPrinterName: null } : { name: 'CHEK-1' },
    );

    const r = await printReceiptViaAgent('s-1');

    expect(r.handled).toBe(false);
    expect(r.reason).toBe('printer-not-set');
  });
});

describe('printZReportViaAgent — uzilish sababi', () => {
  it('printer sozlanmagan ⇒ reason=printer-not-set (chek bilan bir xil)', async () => {
    installShell();
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url.startsWith('/sklad-keepers') ? { receiptPrinterName: null } : {},
    );

    const r = await printZReportViaAgent('sess-1', LABELS);
    expect(r).toMatchObject({ handled: false, reason: 'printer-not-set' });
  });
});
