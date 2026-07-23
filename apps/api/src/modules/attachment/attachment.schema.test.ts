import { describe, expect, it } from 'vitest';
import {
  AccountAttachmentsFilterSchema,
  ListAttachmentsSchema,
  UploadAttachmentSchema,
} from './attachment.schema.js';

const uuid = () => crypto.randomUUID();

describe('UploadAttachmentSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = UploadAttachmentSchema.safeParse({
      entity: 'Demand',
      entityId: uuid(),
      filename: 'invoice.pdf',
      mime: 'application/pdf',
      dataBase64: 'JVBERi0xLjQKJeLjz9MK',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unsupported entity', () => {
    expect(
      UploadAttachmentSchema.safeParse({
        entity: 'UnknownEntity',
        entityId: uuid(),
        filename: 'a.pdf',
        mime: 'application/pdf',
        dataBase64: 'AAA=',
      }).success,
    ).toBe(false);
  });

  it('rejects malformed entityId', () => {
    expect(
      UploadAttachmentSchema.safeParse({
        entity: 'Demand',
        entityId: 'not-a-uuid',
        filename: 'a.pdf',
        mime: 'application/pdf',
        dataBase64: 'AAA=',
      }).success,
    ).toBe(false);
  });

  it('rejects empty filename', () => {
    expect(
      UploadAttachmentSchema.safeParse({
        entity: 'Demand',
        entityId: uuid(),
        filename: '',
        mime: 'application/pdf',
        dataBase64: 'AAA=',
      }).success,
    ).toBe(false);
  });

  it('rejects 256-char filename', () => {
    expect(
      UploadAttachmentSchema.safeParse({
        entity: 'Demand',
        entityId: uuid(),
        filename: 'a'.repeat(256),
        mime: 'application/pdf',
        dataBase64: 'AAA=',
      }).success,
    ).toBe(false);
  });

  it('rejects empty dataBase64', () => {
    expect(
      UploadAttachmentSchema.safeParse({
        entity: 'Demand',
        entityId: uuid(),
        filename: 'a.pdf',
        mime: 'application/pdf',
        dataBase64: '',
      }).success,
    ).toBe(false);
  });

  it('treats empty-string description as null', () => {
    const r = UploadAttachmentSchema.safeParse({
      entity: 'Demand',
      entityId: uuid(),
      filename: 'a.pdf',
      mime: 'application/pdf',
      dataBase64: 'AAA=',
      description: '',
    });
    if (!r.success) throw r.error;
    expect(r.data.description).toBeNull();
  });

  it('rejects 501-char description', () => {
    expect(
      UploadAttachmentSchema.safeParse({
        entity: 'Demand',
        entityId: uuid(),
        filename: 'a.pdf',
        mime: 'application/pdf',
        dataBase64: 'AAA=',
        description: 'a'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('accepts all whitelisted entities', () => {
    const entities = [
      'Counterparty',
      'CustomerOrder',
      'Demand',
      'InvoiceOut',
      'Supply',
      'PurchaseOrder',
      'InvoiceIn',
      'PaymentIn',
      'PaymentOut',
      'SalesReturn',
      'PurchaseReturn',
      'Move',
      'Loss',
      'Enter',
      'Inventory',
      'CashIn',
      'CashOut',
      'Opportunity',
      'Product',
      'CommissionReportOut',
      'CommissionReportIn',
    ];
    for (const entity of entities) {
      const r = UploadAttachmentSchema.safeParse({
        entity,
        entityId: uuid(),
        filename: 'a.pdf',
        mime: 'application/pdf',
        dataBase64: 'AAA=',
      });
      expect(r.success, `entity=${entity}`).toBe(true);
    }
  });
});

describe('ListAttachmentsSchema', () => {
  it('requires entity + entityId', () => {
    expect(ListAttachmentsSchema.safeParse({}).success).toBe(false);
    expect(ListAttachmentsSchema.safeParse({ entity: 'Demand' }).success).toBe(false);
  });

  it('defaults limit to 50', () => {
    const r = ListAttachmentsSchema.safeParse({
      entity: 'Demand',
      entityId: uuid(),
    });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('coerces limit from string', () => {
    const r = ListAttachmentsSchema.safeParse({
      entity: 'Demand',
      entityId: uuid(),
      limit: '20',
    });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(20);
  });

  it('rejects limit above max (500)', () => {
    expect(
      ListAttachmentsSchema.safeParse({
        entity: 'Demand',
        entityId: uuid(),
        limit: 501,
      }).success,
    ).toBe(false);
  });
});

describe('AccountAttachmentsFilterSchema (account-wide «Файлы»)', () => {
  it('accepts an empty payload (no entity/entityId required — unlike ListAttachmentsSchema)', () => {
    const r = AccountAttachmentsFilterSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
    expect(r.data.entity).toBeUndefined();
    expect(r.data.cursor).toBeUndefined();
  });

  it('accepts optional entity host-type filter + search + cursor', () => {
    const r = AccountAttachmentsFilterSchema.safeParse({
      entity: 'Demand',
      search: 'invoice',
      cursor: uuid(),
      limit: '25',
    });
    if (!r.success) throw r.error;
    expect(r.data.entity).toBe('Demand');
    expect(r.data.search).toBe('invoice');
    expect(r.data.limit).toBe(25);
  });

  it('rejects unsupported entity filter', () => {
    expect(AccountAttachmentsFilterSchema.safeParse({ entity: 'NotAnEntity' }).success).toBe(false);
  });

  it('rejects a non-uuid cursor', () => {
    expect(AccountAttachmentsFilterSchema.safeParse({ cursor: 'nope' }).success).toBe(false);
  });

  it('caps limit at 200', () => {
    expect(AccountAttachmentsFilterSchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});
