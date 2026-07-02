import { describe, expect, it } from 'vitest';
import {
  CreatePrintTemplateSchema,
  PrintEntitySchema,
  PrintFormatSchema,
  PrintTemplateFilterSchema,
  UpdatePrintTemplateSchema,
} from './print-template.schema.js';

describe('PrintEntitySchema', () => {
  it.each(['customerorder', 'demand', 'invoiceout', 'cashin', 'production'])('accepts %s', (e) => {
    expect(PrintEntitySchema.safeParse(e).success).toBe(true);
  });

  it('rejects unknown entity', () => {
    expect(PrintEntitySchema.safeParse('foobar').success).toBe(false);
  });
});

describe('PrintFormatSchema', () => {
  it.each(['pdf', 'docx', 'html', 'txt'])('accepts %s', (f) => {
    expect(PrintFormatSchema.safeParse(f).success).toBe(true);
  });

  it('rejects unknown format', () => {
    expect(PrintFormatSchema.safeParse('rtf').success).toBe(false);
  });
});

describe('CreatePrintTemplateSchema', () => {
  const base = {
    entity: 'invoiceout' as const,
    name: 'Standart',
    bodyHtml: '<h1>{{name}}</h1>',
  };

  it('accepts minimal payload with defaults', () => {
    const r = CreatePrintTemplateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.format).toBe('pdf');
      expect(r.data.pageSize).toBe('A4');
      expect(r.data.enabled).toBe(true);
      expect(r.data.isDefault).toBe(false);
      expect(r.data.marginTop).toBe(20);
    }
  });

  it('rejects empty name', () => {
    expect(CreatePrintTemplateSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('rejects empty bodyHtml', () => {
    expect(CreatePrintTemplateSchema.safeParse({ ...base, bodyHtml: '' }).success).toBe(false);
  });

  it('coerces margin strings to ints', () => {
    const r = CreatePrintTemplateSchema.safeParse({
      ...base,
      marginTop: '10',
      marginRight: '5',
      marginBottom: '10',
      marginLeft: '5',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.marginTop).toBe(10);
  });

  it('rejects margin > 100', () => {
    expect(CreatePrintTemplateSchema.safeParse({ ...base, marginTop: 200 }).success).toBe(false);
  });

  it('coerces isDefault from string', () => {
    const r = CreatePrintTemplateSchema.safeParse({ ...base, isDefault: 'true' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isDefault).toBe(true);
  });
});

describe('UpdatePrintTemplateSchema', () => {
  it('accepts partial update', () => {
    expect(UpdatePrintTemplateSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('accepts partial bodyHtml change', () => {
    expect(UpdatePrintTemplateSchema.safeParse({ bodyHtml: '<p>updated</p>' }).success).toBe(true);
  });
});

describe('PrintTemplateFilterSchema', () => {
  it('uses default limit', () => {
    const r = PrintTemplateFilterSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(100);
  });

  it('accepts entity + format combo', () => {
    const r = PrintTemplateFilterSchema.safeParse({ entity: 'demand', format: 'docx' });
    expect(r.success).toBe(true);
  });

  it('rejects limit > 500', () => {
    expect(PrintTemplateFilterSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
});
