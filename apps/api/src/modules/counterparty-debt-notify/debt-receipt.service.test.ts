import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtReceiptService } from './debt-receipt.service.js';

/**
 * «Hisob-kitob cheki» xizmati — QO'RIQCHILAR va NOJO'YA TA'SIRLAR.
 *
 * Matn ko'rinishi `debt-receipt-message.util.test.ts` da qulflangan; bu yerda
 * xizmat qatlamining uch shartnomasi:
 *   1. **`preview()` HECH NARSA o'zgartirmaydi** — na navbat qatori, na ochiq
 *      havola. Aks holda kartani ochgan har bir xodim mijozning butun tarixiga
 *      ochiq havola yaratib qo'yardi (havola — tashqi ta'sir).
 *   2. **Yuborib bo'lmasa SABAB aytiladi** — «tugma ishlamadi» eng qimmat
 *      shikoyat; prodda o'lchangan ikki holat: Telegram raqami ulanmagan va
 *      mijozda telefon yo'q.
 *   3. **Har bo'lak alohida navbat qatori** va manba turi `debt.receipt` —
 *      avtomatik xabardan (`debt.counterparty_notify`) ajralib tursin.
 */

// Ochiq havola FAQAT `PUBLIC_APP_URL` sozlanganda yaratiladi. Muhitga
// tayanib qolmaslik uchun test uni O'ZI qo'yadi — aks holda dasturchining
// mashinasida yashil, CI'da qizil bo'lardi (yoki teskarisi).
beforeEach(() => {
  vi.stubEnv('PUBLIC_APP_URL', 'https://erp.sherset.uz');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const OPENING = {
  moment: new Date('2026-08-01T00:00:00Z'),
  docType: 'opening',
  docNumber: '—',
  deltaMinor: 2540300000n,
  items: [],
};
const SALE = {
  moment: new Date('2026-08-16T05:00:00Z'),
  docType: 'retailsale',
  docNumber: 'ТРН-2026-00144',
  docId: 'sale-1',
  deltaMinor: 143400000n,
  items: [{ name: 'Vera vkl 1x', quantity: '3', uom: 'шт' }],
};

function makeService(opts: { userbot?: boolean; phone?: string | null } = {}) {
  const outboxCreate = vi.fn(async () => ({ id: 'ob-1' }));
  const publicationFindFirst = vi.fn(async () => null);
  const publicationCreate = vi.fn(async () => ({ token: 'tok-1' }));
  const prisma = {
    client: {
      hrTelegramAccount: {
        findFirst: vi.fn(async () => (opts.userbot === false ? null : { id: 'ub-1' })),
      },
      counterparty: {
        findFirst: vi.fn(async () => ({
          id: 'cp-1',
          phone: opts.phone === undefined ? '+998901234567' : opts.phone,
        })),
      },
      organization: { findFirst: vi.fn(async () => ({ name: 'Sherset' })) },
      hrTelegramOutbox: { create: outboxCreate },
      publication: { findFirst: publicationFindFirst, create: publicationCreate },
      retailSale: { findFirst: vi.fn(async () => ({ ownerId: 'u-1' })) },
    },
  };
  const statements = {
    aggregate: vi.fn(async () => ({
      cp: {
        id: 'cp-1',
        name: 'Mir Obit aka',
        phone: opts.phone === undefined ? '+998901234567' : opts.phone,
      },
      data: {
        lines: [OPENING, SALE],
        openingMinor: 2540300000n,
        finalBalanceMinor: 2683700000n,
      },
    })),
  };
  const svc = new DebtReceiptService(prisma as never, statements as never);
  return { svc, outboxCreate, publicationCreate, publicationFindFirst };
}

describe('DebtReceiptService.preview — NOJO`YA TA`SIRSIZ', () => {
  it('🔴 navbatga hech narsa qo`ymaydi va havola YARATMAYDI', async () => {
    const { svc, outboxCreate, publicationCreate } = makeService();

    const r = await svc.preview('acc-1', 'cp-1');

    expect(outboxCreate).not.toHaveBeenCalled();
    expect(publicationCreate).not.toHaveBeenCalled();
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it('matn ichida oldingi qoldiq, chek va yakuniy qarz bor', async () => {
    const { svc } = makeService();
    const [text] = (await svc.preview('acc-1', 'cp-1')).messages;
    expect(text).toContain('📌 Oldingi qoldiq: 25 403 000');
    expect(text).toContain('📄 Savdo cheki №ТРН‑2026‑00144');
    // `opening` qatori hujjatlar ro'yxatida TAKRORLANMAYDI.
    expect(text?.match(/📄|📌/g) ?? []).toHaveLength(2);
    expect(text).toContain('💰 *Jami qarzingiz: 26 837 000');
  });

  it('hujjat soni `opening` ni sanamaydi', async () => {
    const { svc } = makeService();
    expect((await svc.preview('acc-1', 'cp-1')).docCount).toBe(1);
  });

  it('Telegram raqami ulanmagan ⇒ canSend=false va SABAB', async () => {
    const { svc } = makeService({ userbot: false });
    const r = await svc.preview('acc-1', 'cp-1');
    expect(r.canSend).toBe(false);
    expect(r.reason).toContain('Telegram raqami ulanmagan');
  });

  it('mijozda telefon yo`q ⇒ canSend=false va SABAB', async () => {
    const { svc } = makeService({ phone: null });
    const r = await svc.preview('acc-1', 'cp-1');
    expect(r.canSend).toBe(false);
    expect(r.reason).toContain('telefon raqami');
  });
});

describe('DebtReceiptService.send', () => {
  it('har bo`lak alohida navbat qatori, manba turi `debt.receipt`', async () => {
    const { svc, outboxCreate } = makeService();

    const r = await svc.send('acc-1', 'cp-1');

    expect(r.queued).toBe(outboxCreate.mock.calls.length);
    const data = (outboxCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.sourceEventType).toBe('debt.receipt');
    expect(data.status).toBe('pending');
    expect(data.counterpartyId).toBe('cp-1');
    expect(String(data.toPhone)).toContain('998901234567');
  });

  it('🔴 yuborishda chek havolasi YARATILADI (ko`rib chiqishda emas)', async () => {
    const { svc, publicationCreate } = makeService();
    await svc.send('acc-1', 'cp-1');
    expect(publicationCreate).toHaveBeenCalledTimes(1);
  });

  it('Telegram raqami ulanmagan bo`lsa YUBORMAYDI — aniq xato', async () => {
    const { svc, outboxCreate } = makeService({ userbot: false });
    await expect(svc.send('acc-1', 'cp-1')).rejects.toThrow(/Telegram raqami ulanmagan/);
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('telefonsiz mijozga YUBORMAYDI', async () => {
    const { svc, outboxCreate } = makeService({ phone: null });
    await expect(svc.send('acc-1', 'cp-1')).rejects.toThrow(/telefon/);
    expect(outboxCreate).not.toHaveBeenCalled();
  });
});
