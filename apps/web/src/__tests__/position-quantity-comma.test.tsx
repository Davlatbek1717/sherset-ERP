import { renderWithProviders, screen } from '@/test-utils';
import { PositionTable } from '@moysklad/ui';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Hujjat qatorida vergulli miqdor («1,5») — jimgina NOLGA aylanmaydi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): ru-lokalda o'nlik ajratgich VERGUL, jadval
 * ham sonlarni `toLocaleString('ru-RU')` bilan vergul bilan chizadi — ya'ni
 * «1,5» yozish tabiiy harakat. Lekin qiymat satr sifatida xomligicha
 * saqlanardi va keyin:
 *   • `computePositionTotal` → `BigInt("1,5")` tashlaydi → `catch` → **0n**:
 *     «Сумма» ustuni bo'sh/0 bo'lardi va «Итого» bu qatorni HISOBGA OLMASDI;
 *   • FE qo'riqchisi ham o'tkazardi (`Number("1,5")` = NaN, `NaN <= 0` false);
 *   • saqlashda server `^\d+(\.\d{1,6})?$` bilan rad etardi va foydalanuvchi
 *     xom «quantity must be a positive decimal» xabarini ko'rardi.
 *
 * Yechim kiritish qatlamida: vergul nuqtaga aylanadi, ya'ni qiymat butun
 * zanjir (jami · FE qo'riq · server sxemasi) qabul qiladigan shaklda saqlanadi.
 * Oraliq holat («1.») saqlanib qoladi — kasr yozayotgan foydalanuvchi
 * to'xtatilmaydi.
 */

function renderRow(onUpdate: ReturnType<typeof vi.fn>) {
  renderWithProviders(
    <PositionTable
      columns={[{ key: 'name' }, { key: 'quantity' }]}
      rows={[
        {
          id: 'r1',
          productLabel: 'Kabel',
          quantity: '1',
          priceMinor: '100000',
          discount: '0',
          vat: '12',
          vatEnabled: true,
        },
      ]}
      onUpdate={onUpdate}
      onRemove={() => {}}
      renderNameCell={(row) => <span>{row.productLabel}</span>}
    />,
  );
}

describe("qator miqdori — vergul o'nlik ajratgich sifatida", () => {
  it('«1,5» nuqtali shaklda saqlanadi', () => {
    const onUpdate = vi.fn();
    renderRow(onUpdate);
    fireEvent.change(screen.getByTestId('pos-r1-qty'), { target: { value: '1,5' } });
    expect(onUpdate).toHaveBeenCalledWith('r1', { quantity: '1.5' });
  });

  it("nuqtali kiritma o'zgarmaydi", () => {
    const onUpdate = vi.fn();
    renderRow(onUpdate);
    fireEvent.change(screen.getByTestId('pos-r1-qty'), { target: { value: '2.25' } });
    expect(onUpdate).toHaveBeenCalledWith('r1', { quantity: '2.25' });
  });

  it("yozilayotgan oraliq holat («1,») saqlanadi — kasr kiritish to'xtamaydi", () => {
    const onUpdate = vi.fn();
    renderRow(onUpdate);
    fireEvent.change(screen.getByTestId('pos-r1-qty'), { target: { value: '1,' } });
    expect(onUpdate).toHaveBeenCalledWith('r1', { quantity: '1.' });
  });
});
