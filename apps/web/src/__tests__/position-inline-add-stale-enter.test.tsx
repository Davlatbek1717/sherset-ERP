import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { PositionInlineAdd } from '@moysklad/ui';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Hujjatga tovar qo'shish — Enter ESKIRGAN taklifni qo'shmaydi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): `handleKeyDown` da
 * `target = chosen ?? (suggestions.length === 1 ? suggestions[0] : undefined)`
 * — bu yerdagi `suggestions` OLDINGI tugagan qidiruv natijasi. Debounce 200 ms,
 * skaner esa matnni terib DARHOL Enter yuboradi. Ya'ni omborchi «kab» yozib
 * bitta natija qolganda shtrix-kod skanerlasa, Enter hali kelmagan natija
 * o'rniga OLDINGI tovarni (Kabel X) jimgina hujjatga qo'shardi — hech qanday
 * xabar yo'q.
 *
 * Aynan shu bug POS'da 2026-08-16 da tuzatilgan (`sotuv/page.tsx`:
 * `searchSettled` + `pendingEnterRef`, izohi: «noto'g'ri tovarni … savatga
 * qo'shib yuborardi»), lekin umumiy hujjat komponentida qolgan edi.
 *
 * Qulflanadigan shartnomalar:
 *   1. natija JORIY matnniki bo'lmasa Enter eski tovarni QO'SHMAYDI;
 *   2. Enter YO'QOLMAYDI — natija kelgach o'sha matnning yagona mosligi qo'shiladi;
 *   3. Enter'dan keyin matn o'zgarsa, kechikkan javob endi qo'shilmaydi.
 */

const CATALOG: Record<string, Array<{ id: string; primary: string }>> = {
  kab: [{ id: 'p-kabel', primary: 'Kabel X' }],
  '4780000000001': [{ id: 'p-skotch', primary: 'Skotch malyar' }],
};

function setup() {
  const onPick = vi.fn();
  /** Har qidiruv uchun qo'lda hal qilinadigan promise — poyga aniq boshqariladi. */
  const pending: Array<{ query: string; resolve: () => void }> = [];
  const onSearch = (query: string) =>
    new Promise<{ items: Array<{ id: string; primary: string }>; total: number }>((res) => {
      pending.push({
        query,
        resolve: () => {
          const items = CATALOG[query] ?? [];
          res({ items, total: items.length });
        },
      });
    });

  renderWithProviders(
    <PositionInlineAdd onSearch={onSearch} onPick={onPick} placeholder="qidirish" />,
  );
  const input = screen.getByTestId('position-inline-add-input') as HTMLInputElement;
  return { onPick, pending, input };
}

/** Debounce (200 ms) + navbatdagi qidiruvni oxirigacha o'tkazadi. */
async function settle(pending: Array<{ query: string; resolve: () => void }>, query: string) {
  await waitFor(() => expect(pending.some((p) => p.query === query)).toBe(true), { timeout: 2000 });
  for (const p of pending.filter((p) => p.query === query)) p.resolve();
}

describe("PositionInlineAdd — skaner Enter'i", () => {
  it("eskirgan taklifni qo'shmaydi va Enter'ni yo'qotmaydi", async () => {
    const { onPick, pending, input } = setup();

    // 1) «kab» — natija keladi, ro'yxatda bitta Kabel X qoladi.
    fireEvent.change(input, { target: { value: 'kab' } });
    await settle(pending, 'kab');
    await waitFor(() => expect(screen.getByText('Kabel X')).toBeInTheDocument());

    // 2) Skaner: matn almashadi va DARHOL Enter — javob hali yo'q.
    fireEvent.change(input, { target: { value: '4780000000001' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Eski tovar QO'SHILMASLIGI kerak.
    expect(onPick).not.toHaveBeenCalled();

    // 3) Skaner javobi kelgach — Enter o'z tovariga qo'llanadi.
    await settle(pending, '4780000000001');
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ id: 'p-skotch' });
  });

  it("Enter'dan keyin matn o'zgarsa, o'sha Enter BOSHQA matn natijasiga qo'llanmaydi", async () => {
    const { onPick, pending, input } = setup();

    // Skaner matni + darhol Enter (natija hali yo'q — Enter «parklanadi»).
    fireEvent.change(input, { target: { value: '4780000000001' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Kassir fikridan qaytib boshqa matn terdi (debounce ichida — birinchi
    // so'rov umuman ketmaydi).
    fireEvent.change(input, { target: { value: 'kab' } });

    // «kab» ning yagona mosligi bor, LEKIN parklangan Enter unga tegishli emas.
    await settle(pending, 'kab');
    await new Promise((r) => setTimeout(r, 50));
    expect(onPick).not.toHaveBeenCalled();
  });
});
