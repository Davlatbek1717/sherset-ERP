/**
 * Parity tests for the shared money / invoice toolbar dropdowns.
 *
 * Source-of-truth: docs/moysklad-reference/<module>/states/metadata.json
 * (03-edit-dropdown, 05-print-dropdown), captured 2026-05-30. The tests
 * assert item id order, count and disabled flags match moysklad exactly —
 * labels are locale-dependent (provider renders uz) so the id order is the
 * parity contract.
 */
import { renderHookWithProviders } from '@/test-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  useDocEditMenuItems,
  useInvoiceInPrintMenuItems,
  useInvoiceOutPrintMenuItems,
  useMoneyPrintMenuItems,
} from './document-toolbar-menus';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const disabledIds = (items: { id: string; disabled?: boolean }[]) =>
  items.filter((i) => i.disabled).map((i) => i.id);

describe('useDocEditMenuItems (money documents)', () => {
  it('renders the 5 moysklad «Изменить» items in captured order', () => {
    const { result } = renderHookWithProviders(() =>
      useDocEditMenuItems({ selectedIds: new Set(), onBulkDelete: vi.fn() }),
    );
    expect(ids(result.current)).toEqual(['delete', 'copy', 'mass-edit', 'post', 'unpost']);
  });

  it('disables every item when nothing is selected', () => {
    const { result } = renderHookWithProviders(() =>
      useDocEditMenuItems({ selectedIds: new Set(), onBulkDelete: vi.fn() }),
    );
    // No selection + no mass-edit backend → all five disabled.
    expect(disabledIds(result.current).sort()).toEqual(
      ['copy', 'delete', 'mass-edit', 'post', 'unpost'].sort(),
    );
  });

  it('enables «Удалить» once rows are selected', () => {
    const { result } = renderHookWithProviders(() =>
      useDocEditMenuItems({ selectedIds: new Set(['a', 'b']), onBulkDelete: vi.fn() }),
    );
    expect(result.current.find((i) => i.id === 'delete')?.disabled).toBe(false);
    // copy/post/unpost stay disabled placeholders; mass-edit disabled (no handler).
    expect(result.current.find((i) => i.id === 'mass-edit')?.disabled).toBe(true);
  });
});

describe('useDocEditMenuItems (invoices)', () => {
  it('appends «Объединить» and enables mass-edit with a handler + selection', () => {
    const onMassEdit = vi.fn();
    const { result } = renderHookWithProviders(() =>
      useDocEditMenuItems({
        selectedIds: new Set(['x']),
        onBulkDelete: vi.fn(),
        onMassEdit,
        includeMerge: true,
      }),
    );
    expect(ids(result.current)).toEqual(['delete', 'copy', 'mass-edit', 'post', 'unpost', 'merge']);
    expect(result.current.find((i) => i.id === 'mass-edit')?.disabled).toBe(false);
    expect(result.current.find((i) => i.id === 'merge')?.disabled).toBe(true);
  });
});

describe('useMoneyPrintMenuItems', () => {
  it('renders the 9 captured money-doc «Печать» items in order', () => {
    const { result } = renderHookWithProviders(() => useMoneyPrintMenuItems());
    expect(ids(result.current)).toEqual([
      'all-payments',
      'cash-in-list',
      'cash-in-form',
      'cash-out-list',
      'cash-out-form',
      'payment-in-list',
      'payment-out-list',
      'payment-order',
      'payment-order-uz',
    ]);
  });

  it('disables only the per-document print forms (need a selection)', () => {
    const { result } = renderHookWithProviders(() => useMoneyPrintMenuItems());
    expect(disabledIds(result.current)).toEqual([
      'cash-in-form',
      'cash-out-form',
      'payment-order',
      'payment-order-uz',
    ]);
  });
});

describe('useInvoiceOutPrintMenuItems', () => {
  it('renders the 6 captured invoices-out «Печать» items in order', () => {
    const { result } = renderHookWithProviders(() => useInvoiceOutPrintMenuItems());
    expect(ids(result.current)).toEqual([
      'list',
      'schet-uz',
      'schet-uz-new',
      'schet-stamp',
      'schet',
      'set',
    ]);
    // Only «Список счетов» is enabled.
    expect(disabledIds(result.current)).toEqual([
      'schet-uz',
      'schet-uz-new',
      'schet-stamp',
      'schet',
      'set',
    ]);
  });
});

describe('useInvoiceInPrintMenuItems', () => {
  it('renders the 3 captured invoices-in «Печать» items in order', () => {
    const { result } = renderHookWithProviders(() => useInvoiceInPrintMenuItems());
    expect(ids(result.current)).toEqual(['list', 'schet-supplier', 'set']);
    expect(disabledIds(result.current)).toEqual(['schet-supplier', 'set']);
  });
});
