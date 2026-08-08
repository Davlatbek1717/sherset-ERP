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
