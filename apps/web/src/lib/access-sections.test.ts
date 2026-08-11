import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';
import {
  ACCESS_SECTIONS,
  ACTION_GROUPS,
  type MatrixCell,
  groupRefs,
  refsOn,
  setRefs,
} from './access-sections';

const lookup = (messages: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, messages);

const editGroup = ACTION_GROUPS.find((g) => g.key === 'edit');
if (!editGroup) throw new Error('edit group missing');
const viewGroup = ACTION_GROUPS.find((g) => g.key === 'view');
if (!viewGroup) throw new Error('view group missing');

describe('«Настройка доступа» sections (MoySklad dialog, owner 2026-07-19)', () => {
  it('left column matches the MoySklad screenshot order', () => {
    expect(ACCESS_SECTIONS.map((s) => s.key)).toEqual([
      'dashboard',
      'purchases',
      'sales',
      'goods',
      'marking',
      'crm',
      'stock',
      'money',
      'retail',
      'production',
      'settings',
      'scenarios',
      'exchange',
      'references',
      'tasks',
    ]);
  });

  it('Показатели rows are the five screenshot rows', () => {
    const dashboard = ACCESS_SECTIONS[0];
    expect(dashboard?.rows?.map((r) => r.labelKey)).toEqual([
      'access_row_view_dashboard',
      'access_row_view_korzina',
      'access_row_restore_docs',
      'access_row_clear_korzina',
      'access_row_view_audit',
    ]);
  });

  it('every label path resolves in ru AND uz messages', () => {
    for (const s of ACCESS_SECTIONS) {
      for (const messages of [ru, uz]) {
        expect(typeof lookup(messages, s.labelPath), s.labelPath).toBe('string');
        for (const e of s.entities) {
          expect(typeof lookup(messages, e.labelPath), e.labelPath).toBe('string');
        }
        for (const r of s.rows ?? []) {
          expect(typeof lookup(messages, `pages.employee_card.${r.labelKey}`), r.labelKey).toBe(
            'string',
          );
        }
      }
    }
  });

  it('entities are lowercase slugs (backend matrix format)', () => {
    for (const s of ACCESS_SECTIONS) {
      for (const e of s.entities) expect(e.entity).toMatch(/^[a-z]+$/);
    }
  });

  it('nav-gated MODULE keys stay coherent: demand lives in sales, paymentin in money', () => {
    const find = (entity: string) =>
      ACCESS_SECTIONS.find((s) => s.entities.some((e) => e.entity === entity))?.key;
    expect(find('demand')).toBe('sales');
    expect(find('paymentin')).toBe('money');
    expect(find('product')).toBe('goods');
  });

  /**
   * TZ v3 §3 (review 2026-08-10 I4): yacheyka amallari `store` dan AJRALIB
   * `storecell` obyektiga o'tgan edi, lekin bu dialogda qatori yo'q edi —
   * ya'ni admin uni HECH QAYSI ekrandan bera/ola olmasdi (faqat shablon roli
   * yoki `topup-role-permissions` skripti orqali). Qator «Склад» bo'limida,
   * `store` yonida turadi.
   */
  it('yacheyka amallari (`storecell`) — «Склад» bo`limida, `store` yonida', () => {
    const stock = ACCESS_SECTIONS.find((s) => s.key === 'stock');
    const slugs = stock?.entities.map((e) => e.entity) ?? [];
    expect(slugs).toContain('storecell');
    expect(slugs.indexOf('storecell')).toBe(slugs.indexOf('store') + 1);
    // Ma'lumotnoma qatori: Проводить/Печатать ustunlari yo'q (hujjat emas).
    expect(stock?.entities.find((e) => e.entity === 'storecell')?.doc).toBe(false);
  });

  it('checkbox ON grants ALL on the group actions; OFF removes the cells', () => {
    let cells: MatrixCell[] = [];
    cells = setRefs(cells, groupRefs('demand', editGroup), true);
    expect(cells).toEqual([
      { entity: 'demand', action: 'create', scope: 'ALL' },
      { entity: 'demand', action: 'update', scope: 'ALL' },
    ]);
    expect(refsOn(cells, groupRefs('demand', editGroup))).toBe(true);
    cells = setRefs(cells, groupRefs('demand', editGroup), false);
    expect(cells).toHaveLength(0);
  });

  it('unchecking Просматривать leaves the other cells untouched', () => {
    let cells: MatrixCell[] = [
      { entity: 'demand', action: 'view', scope: 'ALL' },
      { entity: 'demand', action: 'create', scope: 'ALL' },
      { entity: 'customerorder', action: 'view', scope: 'ALL' },
    ];
    cells = setRefs(cells, groupRefs('demand', viewGroup), false);
    expect(refsOn(cells, groupRefs('demand', viewGroup))).toBe(false);
    expect(cells.some((c) => c.entity === 'demand' && c.action === 'create')).toBe(true);
    expect(refsOn(cells, groupRefs('customerorder', viewGroup))).toBe(true);
  });

  it('re-checking never duplicates cells', () => {
    const once = setRefs([], groupRefs('demand', editGroup), true);
    const twice = setRefs(once, groupRefs('demand', editGroup), true);
    expect(twice).toHaveLength(editGroup.actions.length);
  });

  it('partial group (create without update) reads as OFF', () => {
    const cells: MatrixCell[] = [{ entity: 'demand', action: 'create', scope: 'ALL' }];
    expect(refsOn(cells, groupRefs('demand', editGroup))).toBe(false);
  });
});
