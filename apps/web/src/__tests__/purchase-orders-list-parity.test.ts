import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guards for the purchase-orders LIST page parity (measured live
 * vs moysklad #purchaseorder on the user's own climart account, 2026-06-18):
 *  1. The «Контрагент» and «Комментарий» columns carry explicit widths — they
 *     collapsed to width 0 under the table-layout:fixed grid (whole supplier
 *     column invisible) when left width-less. Lock the widths in.
 *  2. The toolbar carries NO «Статус ▾» dropdown. moysklad's PO toolbar on the
 *     user's account is Изменить · Создать · Печать; «Статус ▾» only appears
 *     for accounts with custom purchase-order statuses configured (the free
 *     reference account had it, climart does not). A previous round added an
 *     always-on FSM-state «Статус» filter — wrong on both counts (always-shown
 *     + FSM states instead of custom statuses) — so it was removed. Lock it out.
 */
const PO_PAGE = join(__dirname, '..', 'app', '(app)', 'purchase-orders', 'page.tsx');

describe('purchase-orders list — moysklad parity locks', () => {
  const src = readFileSync(PO_PAGE, 'utf8');

  it('agent + description columns keep an explicit width (no width-0 collapse)', () => {
    // both column blocks must declare a width before their cell renderer
    const agent = src.slice(src.indexOf("key: 'agent'"), src.indexOf("key: 'organization'"));
    const desc = src.slice(src.indexOf("key: 'description'"), src.indexOf("key: 'state'"));
    expect(agent).toMatch(/width: '\d+px'/);
    expect(desc).toMatch(/width: '\d+px'/);
  });

  it('does NOT add a «Статус ▾» toolbar dropdown (climart-account parity)', () => {
    expect(src).not.toContain('StatusFilterDropdown');
    expect(src).not.toContain('status-filter-dropdown');
    // the state-filter setter stays dormant (no UI writes it) until/unless PO
    // gets account-configurable custom statuses
    expect(src).toContain('const [stateFilter, _setStateFilter]');
  });
});
