import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentInService } from './payment-in.service.js';

// M-04 (Faza 16): valyutalararo to'lov-taqsimot guard. USD to'lov UZS
// invoice'ga tiyin-yuzma-yuz qo'shilmasin — ensureOperations to'lov valyutasi
// bilan nishon-hujjat valyutasini solishtirib, farq bo'lsa 400 qaytaradi
// (moysklad ham bir-valyuta talab qiladi).

type EnsureOperations = {
  ensureOperations(
    accountId: string,
    operations: Array<{
      targetKind: string;
      invoiceOutId?: string | null;
      customerOrderId?: string | null;
      amountMinor: string;
    }>,
    sumMinor: bigint,
    paymentCurrency: string,
  ): Promise<void>;
};

function makeService(rows: {
  invoiceOut?: { id: string; currency: string } | null;
  customerOrder?: { id: string; currency: string } | null;
}) {
  const client = {
    invoiceOut: { findFirst: vi.fn().mockResolvedValue(rows.invoiceOut ?? null) },
    customerOrder: { findFirst: vi.fn().mockResolvedValue(rows.customerOrder ?? null) },
  };
  const service = new PaymentInService(
    { client } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  return service as unknown as EnsureOperations;
}

/**
 * Faza Q9 (`INT-05`) — `create(..., tx)` shartnomasi. Tashqi tranzaksiya
 * berilganda hujjatning HAMMA yozuvi o'sha tx'da bajarilishi shart; birortasi
 * bazaviy mijozda qolsa atomiklik YOLG'ON bo'ladi (bank-import crash-oynasi
 * ochiq qolardi) va typecheck buni ko'rmaydi — shuning uchun runtime testi.
 */
const AGENT_ID = '00000000-0000-0000-0000-0000000000a1';
const ORG_ID = '00000000-0000-0000-0000-0000000000b1';

function makeTxProbe() {
  const calls: string[] = [];
  const spy = (label: string, result: unknown) =>
    vi.fn(async () => {
      calls.push(label);
      return result;
    });

  const make = (owner: 'base' | 'tx') => ({
    counterparty: { findFirst: spy(`${owner}:counterparty`, { id: AGENT_ID }) },
    organization: { findFirst: spy(`${owner}:organization`, { id: ORG_ID }) },
    employee: { findUnique: spy(`${owner}:employee`, null) },
    group: { findFirst: spy(`${owner}:group`, { id: 'g1' }) },
    documentSequence: {
      findUnique: spy(`${owner}:sequence.find`, { value: 7 }),
      createMany: spy(`${owner}:sequence.createMany`, { count: 0 }),
      update: spy(`${owner}:sequence.update`, { value: 8 }),
    },
    paymentIn: {
      findMany: spy(`${owner}:paymentIn.findMany`, []),
      create: spy(`${owner}:paymentIn.create`, { id: 'pi-tx' }),
    },
    auditLog: { create: spy(`${owner}:auditLog.create`, { id: 'al-1' }) },
  });

  const base = make('base');
  const tx = make('tx');
  const service = new PaymentInService(
    { client: base } as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    { validateAndNormalize: vi.fn(async () => ({})) } as never,
    { fireForEvent: vi.fn() } as never,
    undefined as never,
  );
  return { service, base, tx, calls };
}

describe('create(…, tx) — tashqi tranzaksiya (Faza Q9, INT-05)', () => {
  const INPUT = {
    agentId: AGENT_ID,
    organizationId: ORG_ID,
    sumMinor: '150000',
  };

  it('tx berilganda hujjat, raqam-hisoblagich va audit AYNAN tx‘da yoziladi', async () => {
    const { service, tx, calls } = makeTxProbe();

    const created = await service.create('acc-1', 'user-1', INPUT, tx as never);

    expect(created).toEqual({ id: 'pi-tx' });
    expect(tx.paymentIn.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.documentSequence.update).toHaveBeenCalledTimes(1);
    // Bazaviy mijozga BIROR chaqiruv tushmasligi kerak — aks holda o'sha
    // yozuv tranzaksiyadan tashqarida qolib, rollback uni qaytarmaydi.
    expect(calls.filter((c) => c.startsWith('base:'))).toEqual([]);
  });

  it('tx berilmasa hammasi bazaviy mijozda qoladi (eski chaqiruvchilar buzilmaydi)', async () => {
    const { service, base, tx, calls } = makeTxProbe();

    await service.create('acc-1', 'user-1', INPUT);

    expect(base.paymentIn.create).toHaveBeenCalledTimes(1);
    expect(base.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentIn.create).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.startsWith('tx:'))).toEqual([]);
  });
});

describe('ensureOperations — valyutalararo to‘lov guard (M-04)', () => {
  it('USD to‘lov UZS invoice’ga taqsimlansa → 400', async () => {
    const svc = makeService({ invoiceOut: { id: 'inv1', currency: 'UZS' } });
    await expect(
      svc.ensureOperations(
        'acc1',
        [{ targetKind: 'invoiceout', invoiceOutId: 'inv1', amountMinor: '10000' }],
        10_000n,
        'USD',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('bir xil valyuta (UZS↔UZS) → o‘tadi', async () => {
    const svc = makeService({ invoiceOut: { id: 'inv1', currency: 'UZS' } });
    await expect(
      svc.ensureOperations(
        'acc1',
        [{ targetKind: 'invoiceout', invoiceOutId: 'inv1', amountMinor: '10000' }],
        10_000n,
        'UZS',
      ),
    ).resolves.toBeUndefined();
  });

  it('customerorder nishonida ham valyuta solishtiriladi', async () => {
    const svc = makeService({ customerOrder: { id: 'co1', currency: 'USD' } });
    await expect(
      svc.ensureOperations(
        'acc1',
        [{ targetKind: 'customerorder', customerOrderId: 'co1', amountMinor: '5000' }],
        5_000n,
        'UZS',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
