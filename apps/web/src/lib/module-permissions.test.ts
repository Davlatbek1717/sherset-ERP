import { describe, expect, it } from 'vitest';
import {
  ALL_ACTIONS,
  MODULE_ACCESS,
  type MatrixCell,
  isModuleOn,
  isTabOn,
  moduleEntities,
  setEntitiesAccess,
} from './module-permissions';

const grant = (entity: string): MatrixCell[] =>
  ALL_ACTIONS.map((action) => ({ entity, action, scope: 'ALL' as const }));

const sales = MODULE_ACCESS.find((m) => m.key === 'sales');
if (!sales) throw new Error('sales module missing');
const demandsTab = sales.tabs.find((t) => t.labelPath.endsWith('.demands'));
if (!demandsTab) throw new Error('demands tab missing');

describe('module/tab toggle derivation (owner 2026-07-17 rights tree)', () => {
  it('empty matrix → every gated module OFF, alwaysOn modules ON', () => {
    for (const m of MODULE_ACCESS) {
      expect(isModuleOn([], m)).toBe(m.alwaysOn === true);
    }
  });

  it('one viewable entity turns its module ON and its tab ON', () => {
    const cells = grant('demand');
    expect(isModuleOn(cells, sales)).toBe(true);
    expect(isTabOn(cells, demandsTab)).toBe(true);
    const stock = MODULE_ACCESS.find((m) => m.key === 'stock');
    expect(stock && isModuleOn(cells, stock)).toBe(false);
  });

  it('tab OFF removes only its entities; module stays ON via siblings', () => {
    let cells = [...grant('demand'), ...grant('customerorder')];
    cells = setEntitiesAccess(cells, demandsTab.entities, false);
    expect(isTabOn(cells, demandsTab)).toBe(false);
    expect(isModuleOn(cells, sales)).toBe(true); // customerorder still on
    expect(cells.some((c) => c.entity === 'demand')).toBe(false);
  });

  it('module OFF wipes every governed entity (tabs + extras)', () => {
    const goods = MODULE_ACCESS.find((m) => m.key === 'goods');
    if (!goods) throw new Error('goods missing');
    let cells: MatrixCell[] = [];
    for (const e of moduleEntities(goods)) cells.push(...grant(e));
    cells.push(...grant('demand')); // unrelated survives
    cells = setEntitiesAccess(cells, moduleEntities(goods), false);
    expect(isModuleOn(cells, goods)).toBe(false);
    expect(cells.some((c) => c.entity === 'product')).toBe(false);
    expect(cells.some((c) => c.entity === 'demand')).toBe(true);
  });

  it('toggle ON grants ALL on every action (owner model: visible = works)', () => {
    const cells = setEntitiesAccess([], ['demand'], true);
    expect(cells).toHaveLength(ALL_ACTIONS.length);
    expect(cells.every((c) => c.scope === 'ALL')).toBe(true);
  });

  it('re-granting replaces stale cells instead of duplicating', () => {
    const once = setEntitiesAccess([], ['demand'], true);
    const twice = setEntitiesAccess(once, ['demand'], true);
    expect(twice).toHaveLength(ALL_ACTIONS.length);
  });

  it('every configured entity is lowercase-slug (matches the backend matrix)', () => {
    for (const m of MODULE_ACCESS) {
      for (const e of moduleEntities(m)) {
        expect(e).toMatch(/^[a-z]+$/);
      }
    }
  });
});
