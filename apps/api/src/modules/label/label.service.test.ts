import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LabelService } from './label.service.js';

/**
 * Label coverage:
 *   - Template CRUD basics
 *   - Custom page-size validation (requires width + height)
 *   - Render: quantity fan-out, missing products rejected, archived
 *     template rejected
 *   - Render audit: recordJob persists with snapshot
 *   - Page count math (totalLabels / (cols × rows))
 */

interface TemplateRow {
  id: string;
  accountId: string;
  name: string;
  description: string | null;
  pageSize: string;
  pageWidthMm: number | null;
  pageHeightMm: number | null;
  cols: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  columnGapMm: number;
  rowGapMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  includeName: boolean;
  includePrice: boolean;
  includeBarcode: boolean;
  includeArticle: boolean;
  headerText: string | null;
  barcodeFormat: string;
  archived: boolean;
  deletedAt: Date | null;
}

interface ProductRow {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  barcodes: string[];
  salePrices: Array<{ value: string }>;
}

function makeTemplate(overrides: Partial<TemplateRow> = {}): TemplateRow {
  return {
    id: '00000000-0000-0000-0000-0000000000A0',
    accountId: 'acc-1',
    name: 'A4 standard',
    description: null,
    pageSize: 'A4',
    pageWidthMm: null,
    pageHeightMm: null,
    cols: 3,
    rows: 8,
    marginTopMm: 10,
    marginLeftMm: 10,
    columnGapMm: 3,
    rowGapMm: 3,
    labelWidthMm: 60,
    labelHeightMm: 30,
    includeName: true,
    includePrice: true,
    includeBarcode: true,
    includeArticle: true,
    headerText: null,
    barcodeFormat: 'EAN13',
    archived: false,
    deletedAt: null,
    ...overrides,
  };
}

function makePrismaMock(opts: {
  templates: TemplateRow[];
  products: ProductRow[];
}) {
  const tplFindFirst = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where ?? {};
    return (
      opts.templates.find((r) => {
        if (w.id && r.id !== w.id) return false;
        if (w.deletedAt === null && r.deletedAt !== null) return false;
        return true;
      }) ?? null
    );
  });
  const tplFindMany = vi.fn(async () => opts.templates);
  const tplCreate = vi.fn(async (args: { data: Partial<TemplateRow> }) => {
    const row = makeTemplate({ ...args.data, id: `t-${opts.templates.length + 1}` });
    opts.templates.push(row);
    return row;
  });
  const tplUpdate = vi.fn(async (args: { where: { id: string }; data: Partial<TemplateRow> }) => {
    const row = opts.templates.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, args.data);
    return row;
  });
  const labelTemplate = {
    findFirst: tplFindFirst,
    findMany: tplFindMany,
    create: tplCreate,
    update: tplUpdate,
  };

  const prodFindMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => {
    const ids = new Set(args.where.id.in);
    return opts.products.filter((p) => ids.has(p.id));
  });
  const product = { findMany: prodFindMany };

  const jobCreate = vi.fn(async (args: { data: unknown }) => ({ id: 'job-1', ...args.data }));
  const jobFindMany = vi.fn(async () => []);
  const labelPrintJob = { create: jobCreate, findMany: jobFindMany };

  return {
    client: { labelTemplate, product, labelPrintJob },
    spies: { tplCreate, tplUpdate, prodFindMany, jobCreate },
  };
}

const productA: ProductRow = {
  id: '00000000-0000-0000-0000-0000000000A1',
  name: 'iPhone 15 Pro Max',
  code: 'IPH15PM',
  article: 'A-IPH-001',
  barcodes: ['1234567890123'],
  salePrices: [{ value: '1500000000' }],
};
const productB: ProductRow = {
  id: '00000000-0000-0000-0000-0000000000B2',
  name: 'AirPods Pro',
  code: 'APPRO2',
  article: 'A-APP-002',
  barcodes: [],
  salePrices: [{ value: '350000000' }],
};

describe('LabelService — template CRUD', () => {
  it('createTemplate persists with defaults', async () => {
    const prisma = makePrismaMock({ templates: [], products: [] });
    const svc = new LabelService({ client: prisma.client } as never);
    const created = await svc.createTemplate('acc-1', { name: 'My template' });
    expect(created.name).toBe('My template');
    expect(created.pageSize).toBe('A4');
    expect(created.cols).toBe(3);
    expect(created.rows).toBe(8);
  });

  it('custom page-size requires width + height', async () => {
    const prisma = makePrismaMock({ templates: [], products: [] });
    const svc = new LabelService({ client: prisma.client } as never);
    await expect(
      svc.createTemplate('acc-1', { name: 'custom', pageSize: 'custom' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('custom page-size accepts when dims provided', async () => {
    const prisma = makePrismaMock({ templates: [], products: [] });
    const svc = new LabelService({ client: prisma.client } as never);
    const created = await svc.createTemplate('acc-1', {
      name: 'custom-ok',
      pageSize: 'custom',
      pageWidthMm: 200,
      pageHeightMm: 300,
    });
    expect(created.pageSize).toBe('custom');
    expect(created.pageWidthMm).toBe(200);
  });

  it('findTemplateById throws NotFound for missing', async () => {
    const prisma = makePrismaMock({ templates: [], products: [] });
    const svc = new LabelService({ client: prisma.client } as never);
    await expect(svc.findTemplateById('acc-1', 'nope')).rejects.toThrow(NotFoundException);
  });

  it('archiveTemplate stamps archived=true', async () => {
    const templates = [makeTemplate()];
    const prisma = makePrismaMock({ templates, products: [] });
    const svc = new LabelService({ client: prisma.client } as never);
    await svc.archiveTemplate('acc-1', '00000000-0000-0000-0000-0000000000A0');
    expect(templates[0]?.archived).toBe(true);
  });

  it('softDelete stamps deletedAt + archived', async () => {
    const templates = [makeTemplate()];
    const prisma = makePrismaMock({ templates, products: [] });
    const svc = new LabelService({ client: prisma.client } as never);
    await svc.softDeleteTemplate('acc-1', '00000000-0000-0000-0000-0000000000A0');
    expect(templates[0]?.deletedAt).toBeInstanceOf(Date);
    expect(templates[0]?.archived).toBe(true);
  });
});

describe('LabelService — render', () => {
  it('fans out by quantity into labels array', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate()],
      products: [productA, productB],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    const result = await svc.render('acc-1', 'emp-1', {
      templateId: '00000000-0000-0000-0000-0000000000A0',
      items: [
        { productId: productA.id, quantity: 5 },
        { productId: productB.id, quantity: 3 },
      ],
    });
    expect(result.totalLabels).toBe(8);
    expect(result.labels).toHaveLength(8);
    // First 5 should be product A, last 3 product B (sequential)
    expect(result.labels[0]?.productId).toBe(productA.id);
    expect(result.labels[4]?.productId).toBe(productA.id);
    expect(result.labels[5]?.productId).toBe(productB.id);
    expect(result.labels[7]?.productId).toBe(productB.id);
  });

  it('uses first barcode from array; falls back to code when no barcodes', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate()],
      products: [productA, productB],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    const result = await svc.render('acc-1', 'emp-1', {
      templateId: '00000000-0000-0000-0000-0000000000A0',
      items: [
        { productId: productA.id, quantity: 1 },
        { productId: productB.id, quantity: 1 },
      ],
    });
    expect(result.labels[0]?.barcode).toBe('1234567890123');
    expect(result.labels[1]?.barcode).toBe('APPRO2'); // fallback to product.code
  });

  it('computes pageCount as ceil(totalLabels / (cols × rows))', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate({ cols: 3, rows: 8 })], // 24 per page
      products: [productA],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    const result = await svc.render('acc-1', 'emp-1', {
      templateId: '00000000-0000-0000-0000-0000000000A0',
      items: [{ productId: productA.id, quantity: 25 }],
    });
    expect(result.totalLabels).toBe(25);
    expect(result.labelsPerPage).toBe(24);
    expect(result.pageCount).toBe(2);
  });

  it('rejects missing product IDs with clear error message', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate()],
      products: [productA], // B is NOT in the catalog
    });
    const svc = new LabelService({ client: prisma.client } as never);
    await expect(
      svc.render('acc-1', 'emp-1', {
        templateId: '00000000-0000-0000-0000-0000000000A0',
        items: [
          { productId: productA.id, quantity: 1 },
          { productId: productB.id, quantity: 1 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects archived template', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate({ archived: true })],
      products: [productA],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    await expect(
      svc.render('acc-1', 'emp-1', {
        templateId: '00000000-0000-0000-0000-0000000000A0',
        items: [{ productId: productA.id, quantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('recordJob=true persists LabelPrintJob with snapshot', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate()],
      products: [productA],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    await svc.render('acc-1', 'emp-1', {
      templateId: '00000000-0000-0000-0000-0000000000A0',
      items: [{ productId: productA.id, quantity: 5 }],
      recordJob: true,
    });
    expect(prisma.spies.jobCreate).toHaveBeenCalledTimes(1);
    const call = prisma.spies.jobCreate.mock.calls[0]?.[0] as {
      data: { totalLabels: number; itemsSnapshot: { items: Array<{ qty: number }> } };
    };
    expect(call.data.totalLabels).toBe(5);
    expect(call.data.itemsSnapshot.items[0]?.qty).toBe(5);
  });

  it('recordJob=false (default) does NOT persist audit row', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate()],
      products: [productA],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    await svc.render('acc-1', 'emp-1', {
      templateId: '00000000-0000-0000-0000-0000000000A0',
      items: [{ productId: productA.id, quantity: 1 }],
    });
    expect(prisma.spies.jobCreate).not.toHaveBeenCalled();
  });

  it('returns layout data (cols/rows/margins/gaps) for client to render', async () => {
    const prisma = makePrismaMock({
      templates: [makeTemplate({ cols: 4, rows: 6, marginTopMm: 5 })],
      products: [productA],
    });
    const svc = new LabelService({ client: prisma.client } as never);
    const result = await svc.render('acc-1', 'emp-1', {
      templateId: '00000000-0000-0000-0000-0000000000A0',
      items: [{ productId: productA.id, quantity: 1 }],
    });
    expect(result.template.cols).toBe(4);
    expect(result.template.rows).toBe(6);
    expect(result.template.marginTopMm).toBe(5);
  });
});
