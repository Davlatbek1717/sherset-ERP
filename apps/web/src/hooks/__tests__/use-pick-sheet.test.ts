/**
 * Omborchi varag'i (yacheykali) — hook xulqi qulflanadi.
 *
 * Nima uchun kerak: bu hook oldingi qo'lda yozilgan 3 nusxaning o'rniga keldi
 * va o'sha nusxalardagi haqiqiy nuqsonni tuzatadi — ular qatorning O'Z
 * yacheykasini butunlay e'tiborsiz qoldirib, HAR SAFAR tovarning standart
 * yacheykasini so'rardi. Hujjatda «bu tovar 01-02-03 dan olindi» deb yozilgan
 * bo'lsa ham, varaqda boshqa javon chiqishi mumkin edi. Buni hech bir tipdan
 * chiqmaydi — faqat test tutadi.
 */

import { cellCode, usePickSheet } from '@/hooks/use-pick-sheet';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (path: string) => get(path),
  },
}));

const BASE = {
  title: "YIG'ISH VARAG'I",
  number: '00017',
  moment: '2026-07-31T10:00:00.000Z',
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ cells: { p1: 'STANDART-01', p2: 'STANDART-02' } });
});

describe('usePickSheet', () => {
  it('prefers the ROW cell over the product default', async () => {
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [
          { assortmentId: 'p1', productLabel: 'Kabel', quantity: '3', cell: '01-02-03' },
          { assortmentId: 'p2', productLabel: 'Avtomat', quantity: '1', cell: null },
        ],
      });
    });
    const cells = result.current.sheet?.positions.map((p) => p.cell);
    // p1 hujjatda tanlangan yacheykani saqlaydi, p2 standartga tushadi.
    expect(cells).toEqual(['01-02-03', 'STANDART-02']);
  });

  it('does NOT hit the network when every row already has a cell', async () => {
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [{ assortmentId: 'p1', productLabel: 'Kabel', quantity: '3', cell: '01-02-03' }],
      });
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('asks only for the rows that are MISSING a cell', async () => {
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [
          { assortmentId: 'p1', productLabel: 'Kabel', quantity: '3', cell: '01-02-03' },
          { assortmentId: 'p2', productLabel: 'Avtomat', quantity: '1' },
        ],
      });
    });
    expect(get).toHaveBeenCalledTimes(1);
    const path = get.mock.calls[0]?.[0] as string;
    expect(path).toContain('p2');
    expect(path).not.toContain('p1');
  });

  it('drops rows with no product (empty editor lines)', async () => {
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [
          { assortmentId: 'p1', productLabel: 'Kabel', quantity: '3', cell: 'A' },
          { assortmentId: null, productLabel: '', quantity: '' },
        ],
      });
    });
    expect(result.current.sheet?.positions).toHaveLength(1);
  });

  it('still renders the sheet when the cell lookup fails', async () => {
    get.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [{ assortmentId: 'p1', productLabel: 'Kabel', quantity: '3' }],
      });
    });
    // Bo'sh sahifadan ko'ra «Yacheykasiz» guruhi foydaliroq.
    expect(result.current.sheet?.positions).toEqual([
      { name: 'Kabel', qty: '3', uom: null, cell: null },
    ]);
  });

  it('closeSheet clears the sheet', async () => {
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [{ assortmentId: 'p1', productLabel: 'Kabel', quantity: '3', cell: 'A' }],
      });
    });
    expect(result.current.sheet).not.toBeNull();
    act(() => result.current.closeSheet());
    expect(result.current.sheet).toBeNull();
  });

  // ── «Зона / Ячейка» yorlig'i sof kodga keltirilishi ──────────────────────
  // Hujjat qatorida yacheyka `cellPickerLabel()` bilan zona prefiksi bilan
  // saqlanadi. Xom yorliq varaqqa tushsa IKKI narsa buziladi: ombor guruhlash
  // (`warehouseOfCell` `-` bo'yicha birinchi bo'lakni oladi) va 19mm nowrap
  // ustun (printer qirqadi).
  it('strips the zone prefix from the row cell label', async () => {
    const { result } = renderHook(() => usePickSheet());
    await act(async () => {
      await result.current.openSheet({
        ...BASE,
        rows: [
          { assortmentId: 'p1', productLabel: 'Kabel', quantity: '3', cell: 'Zona A / 01-02-03' },
        ],
      });
    });
    expect(result.current.sheet?.positions[0]?.cell).toBe('01-02-03');
  });

  it('cellCode handles bare codes, nested zones and empties', () => {
    expect(cellCode('01-02-03')).toBe('01-02-03');
    expect(cellCode('Zona A / 01-02-03')).toBe('01-02-03');
    // Zona nomining o'zida `/` bo'lsa ham — OXIRGI bo'lak kod.
    expect(cellCode('Ombor 1 / Zona A / 01-02-03')).toBe('01-02-03');
    expect(cellCode(null)).toBeNull();
    expect(cellCode('')).toBeNull();
    expect(cellCode('Zona A / ')).toBeNull();
  });
});
