import { describe, expect, it, vi } from 'vitest';
import { PriceTypeService } from './price-type.service.js';

/**
 * Guards the exactly-one-default invariant of `ensureDefault`. The previous
 * version promoted an arbitrary non-default row WITHOUT clearing existing
 * defaults, so an account could silently acquire a second default — which makes
 * the products list's per-type price columns mirror the default tier. This
 * shipped undetected in the dynamic-price-column work; these branch tests lock
 * the heal/promote/create behaviour.
 */
type PriceTypeRow = { id: string; isDefault?: boolean };

function makeService(rows: {
  defaults: PriceTypeRow[]; // non-archived isDefault rows (in position order)
  firstType?: PriceTypeRow | null; // first non-archived row when no default exists
}) {
  const update = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const create = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue(rows.defaults);
  const findFirst = vi.fn().mockResolvedValue(rows.firstType ?? null);
  const prisma = {
    client: { priceType: { findMany, findFirst, update, updateMany, create } },
  } as unknown as ConstructorParameters<typeof PriceTypeService>[0];
  return { svc: new PriceTypeService(prisma), update, updateMany, create, findFirst };
}

describe('PriceTypeService.ensureDefault', () => {
  it('is a no-op when exactly one default exists', async () => {
    const { svc, update, updateMany, create } = makeService({ defaults: [{ id: 'a' }] });
    await svc.ensureDefault('acc-1');
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('heals a corrupted account: keeps the lowest-position default, demotes the rest', async () => {
    const { svc, updateMany, create, update } = makeService({
      defaults: [{ id: 'retail' }, { id: 'wholesale' }],
    });
    await svc.ensureDefault('acc-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', isDefault: true, id: { not: 'retail' } },
      data: { isDefault: false },
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('promotes the first existing type when no default exists', async () => {
    const { svc, update, create } = makeService({ defaults: [], firstType: { id: 'only' } });
    await svc.ensureDefault('acc-1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'only', accountId: 'acc-1' },
      data: { isDefault: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a default when the account has no price types at all', async () => {
    const { svc, create, update } = makeService({ defaults: [], firstType: null });
    await svc.ensureDefault('acc-1');
    expect(create).toHaveBeenCalledWith({
      data: { accountId: 'acc-1', name: 'Default', currency: 'UZS', isDefault: true, position: 0 },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
