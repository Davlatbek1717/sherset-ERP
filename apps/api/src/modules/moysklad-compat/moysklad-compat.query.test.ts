import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  buildListQuery,
  parseFilter,
  parseOrder,
  scalarFieldTypes,
} from './moysklad-compat.query.js';

// Real dmmf — these tests also pin the schema facts the query builder relies
// on (documents soft-delete via deletedAt and have no archived; references
// archive via archived). If the schema shifts, this fails loudly instead of
// the router 500-ing in production (the original Biznesjon bug).
const demand = scalarFieldTypes('demand');
const counterparty = scalarFieldTypes('counterparty');

describe('schema facts the compat router relies on', () => {
  it('documents: deletedAt yes, archived no', () => {
    expect(demand.has('deletedAt')).toBe(true);
    expect(demand.has('archived')).toBe(false);
    expect(demand.get('updatedAt')).toBe('DateTime');
    expect(demand.get('moment')).toBe('DateTime');
  });

  it('references: archived yes', () => {
    expect(counterparty.get('archived')).toBe('Boolean');
  });

  it('every compat slug model resolves updatedAt (default order key)', () => {
    // Delegate keys mirrored from SLUGS in moysklad-compat.service.ts.
    const models = [
      'counterparty',
      'product',
      'organization',
      'employee',
      'store',
      'productFolder',
      'customerOrder',
      'demand',
      'invoiceOut',
      'supply',
      'purchaseOrder',
      'invoiceIn',
      'salesReturn',
      'purchaseReturn',
      'paymentIn',
      'paymentOut',
      'cashIn',
      'cashOut',
      // NOTE: 'bundle' slug is advertised but has NO Prisma model — it 404s
      // as "not connected" (pre-existing dead slug, guarded in the service).
      'move',
      'loss',
      'enter',
      'inventory',
      'retailSale',
      'cashierSession',
      'production',
      'processingOrder',
      'variant',
      'contactPerson',
      'priceType',
      'cashDesk',
      'task',
      'pipeline',
      'opportunity',
      'call',
      'salesChannel',
      'onlineOrder',
      'webhook',
      'webhookStock',
      'serviceRequest',
    ];
    for (const m of models) {
      expect(scalarFieldTypes(m).get('updatedAt'), m).toBe('DateTime');
    }
  });
});

describe('buildListQuery — the three Biznesjon bugs', () => {
  it('document slug gets NO archived clause (bug 1: every doc slug 500d)', () => {
    const { where } = buildListQuery(demand, { accountId: 'a1' });
    expect(where).toEqual({ accountId: 'a1', deletedAt: null });
  });

  it('reference slug keeps archived=false default and no deletedAt-less crash', () => {
    const { where } = buildListQuery(counterparty, { accountId: 'a1' });
    expect(where.archived).toBe(false);
    expect('deletedAt' in where).toBe(false); // Counterparty has no deletedAt column
  });

  it('filter=updated>=… is applied, not silently ignored (bug 2)', () => {
    const { where } = buildListQuery(demand, {
      accountId: 'a1',
      filter: 'updated>=2989-01-01 00:00:00',
    });
    expect(where.updatedAt).toEqual({ gte: new Date('2989-01-01T00:00:00Z') });
  });

  it('order=updated,desc maps to updatedAt (bug 3: 500d before)', () => {
    const { orderBy } = buildListQuery(demand, { accountId: 'a1', order: 'updated,desc' });
    expect(orderBy).toEqual([{ updatedAt: 'desc' }]);
  });
});

describe('parseFilter', () => {
  it('range pair on one field merges (updated>=A;updated<=B)', () => {
    const { where } = parseFilter('updated>=2026-01-01;updated<=2026-02-01', demand);
    expect(where.updatedAt).toEqual({
      gte: new Date('2026-01-01T00:00:00Z'),
      lte: new Date('2026-02-01T00:00:00Z'),
    });
  });

  it('repeated = on one field becomes IN (moysklad OR semantics)', () => {
    const { where } = parseFilter('name=A;name=B', demand);
    expect(where.name).toEqual({ in: ['A', 'B'] });
  });

  it('single equality collapses to scalar', () => {
    const { where } = parseFilter('name=ОТ-2026-00001', demand);
    expect(where.name).toBe('ОТ-2026-00001');
  });

  it('archived=true overrides the hide-archived default', () => {
    const { where } = buildListQuery(counterparty, { accountId: 'a1', filter: 'archived=true' });
    expect(where.archived).toBe(true);
  });

  it('boolean applicable (провéдено) filter works on documents', () => {
    const { where } = parseFilter('applicable=true', demand);
    expect(where.applicable).toBe(true);
  });

  it('moment range works (document date, distinct from updated)', () => {
    const { where } = parseFilter('moment>=2026-07-01 00:00:00.000', demand);
    expect(where.moment).toEqual({ gte: new Date('2026-07-01T00:00:00.000Z') });
  });

  it('string ops: ~ contains, ~= startsWith, =~ endsWith (insensitive)', () => {
    expect(parseFilter('name~кий', demand).where.name).toEqual({
      contains: 'кий',
      mode: 'insensitive',
    });
    expect(parseFilter('name~=ОТ', demand).where.name).toEqual({
      startsWith: 'ОТ',
      mode: 'insensitive',
    });
    expect(parseFilter('name=~001', demand).where.name).toEqual({
      endsWith: '001',
      mode: 'insensitive',
    });
  });

  it('unknown field → 412 with moysklad-style errors body (no silent ignore)', () => {
    let caught: unknown;
    try {
      parseFilter('nosuchfield=1', demand);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpException);
    const http = caught as HttpException;
    expect(http.getStatus()).toBe(412);
    expect(http.getResponse()).toMatchObject({
      errors: [{ error: expect.stringContaining('nosuchfield') }],
    });
  });

  it('bad datetime / bad boolean / ~ on non-string → 412', () => {
    expect(() => parseFilter('updated>=not-a-date', demand)).toThrow(HttpException);
    expect(() => parseFilter('applicable=yes', demand)).toThrow(HttpException);
    expect(() => parseFilter('updated~2026', demand)).toThrow(HttpException);
  });

  it('ISO datetime with Z also accepted (clients echoing our output)', () => {
    const { where } = parseFilter('updated>=2026-07-18T05:00:00.000Z', demand);
    expect(where.updatedAt).toEqual({ gte: new Date('2026-07-18T05:00:00.000Z') });
  });
});

describe('parseOrder', () => {
  it('multi-segment with default asc', () => {
    expect(parseOrder('moment,desc;name', demand)).toEqual([{ moment: 'desc' }, { name: 'asc' }]);
  });

  it('unknown field → 412', () => {
    expect(() => parseOrder('bogus,desc', demand)).toThrow(HttpException);
  });

  it('bad direction → 412', () => {
    expect(() => parseOrder('name,sideways', demand)).toThrow(HttpException);
  });
});

describe('search', () => {
  it('searches only String columns that exist', () => {
    const { where } = buildListQuery(demand, { accountId: 'a1', search: 'ОТ' });
    expect(where.OR).toEqual([
      { name: { contains: 'ОТ', mode: 'insensitive' } },
      { code: { contains: 'ОТ', mode: 'insensitive' } },
    ]);
  });
});
