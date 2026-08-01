import { DemandPrintDropdown } from '@/components/demands/print-dropdown';
import { renderWithProviders, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Demand list «Печать ▾» — 2026-08-01.
 *
 * «Товарный чек» va «Расходная накладная» JONLANTIRILDI: o'sha shakllar endi
 * haqiqatan bor (`/print/demand/:id` va `?form=chek`). Ular per-HUJJAT
 * bo'lgani uchun aynan BITTA qator tanlanishi shart.
 *
 * Bu test ikki narsani qulflaydi:
 *  1. Tanlov noto'g'ri bo'lganda (0 yoki 2+) tugma OCHILMAYDI — aks holda
 *     «qaysi hujjat?» degan savolga javobsiz oyna ochilardi.
 *  2. Hali qurilmagan shakllar (TTN, Акт, Маркировка) o'chirilgan QOLADI —
 *     soxta ishlaydigan tugma qo'yish foydalanuvchini aldaydi.
 */

const openSpy = vi.fn();

beforeEach(() => {
  openSpy.mockReset();
  vi.stubGlobal('open', openSpy);
});

function render(selected: string[]) {
  return renderWithProviders(
    <DemandPrintDropdown selectedIds={new Set(selected)} onExportList={() => {}} />,
  );
}

/** `testId` sits on the menu CONTENT, not the trigger — open via the button. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button')[0] as HTMLElement);
  await screen.findByTestId('demand-print-dropdown');
}

describe('DemandPrintDropdown — per-document forms', () => {
  it('opens the A4 blank for the single selected demand', async () => {
    const user = userEvent.setup();
    render(['abc-123']);
    await openMenu(user);
    await user.click(screen.getByTestId('demand-print-rashodnaya'));
    expect(openSpy).toHaveBeenCalledWith('/print/demand/abc-123', '_blank', 'noopener');
  });

  it('opens the thermal chek with ?form=chek', async () => {
    const user = userEvent.setup();
    render(['abc-123']);
    await openMenu(user);
    await user.click(screen.getByTestId('demand-print-tovarniy-chek'));
    expect(openSpy).toHaveBeenCalledWith('/print/demand/abc-123?form=chek', '_blank', 'noopener');
  });

  it('stays disabled with NO selection', async () => {
    const user = userEvent.setup();
    render([]);
    await openMenu(user);
    await user.click(screen.getByTestId('demand-print-rashodnaya'));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('stays disabled with MORE THAN ONE row selected', async () => {
    const user = userEvent.setup();
    render(['a', 'b']);
    await openMenu(user);
    await user.click(screen.getByTestId('demand-print-tovarniy-chek'));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('leaves the not-yet-built forms disabled even with one row selected', async () => {
    const user = userEvent.setup();
    render(['abc-123']);
    await openMenu(user);
    for (const id of [
      'demand-print-ttn-uz',
      'demand-print-akt',
      'demand-print-marking-codes-1162',
      'demand-print-sborochniy-list',
    ]) {
      await user.click(screen.getByTestId(id));
    }
    expect(openSpy).not.toHaveBeenCalled();
  });
});
