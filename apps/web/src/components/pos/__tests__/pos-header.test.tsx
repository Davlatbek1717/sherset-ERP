/**
 * F2 (POS redizayn) — 64px ko'k header (spec §3.1).
 *
 * Qulflanayotgan shartnomalar:
 *  · SHERSET matn-logotipi ko'rinadi (public/ da tayyor asset yo'q — tekshirildi);
 *  · smena-chip: kassir ismi + smena yoshi + savdo soni·summasi;
 *  · `stale` da chip sariq holatga o'tadi (`data-stale` bayrog'i);
 *  · `connectionOk=false` da qizil indikator + «aloqa yo'q» matni;
 *  · o'ng chetdagi `children` sloti chiziladi (F6 oyna-tugmalari shu yerga);
 *  · header `position: fixed` EMAS (desktop klaviatura-evristikasi buzilmasin).
 *
 * Soat ATAYLAB assert qilinmaydi — minutlik interval real vaqtga bog'liq,
 * assert flaky bo'lardi (reja 2.2 qadami shu qarorni yozadi).
 */

import { renderWithProviders, screen, waitFor, within } from '@/test-utils';
import type { CurrentSession } from '@moysklad/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { PosHeader, type PosHeaderProps } from '../pos-header';

function SESSION(over: Partial<CurrentSession> = {}): CurrentSession {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    state: 'open',
    openedAt: '2026-08-09T04:00:00.000Z',
    cashier: { id: 'u-1', name: 'Kassir Aliyev' },
    cashDesk: { id: 'cd-1', name: 'Asosiy kassa', currency: 'UZS' },
    store: { id: 'st-1', name: 'Markaziy do‘kon' },
    organization: { id: 'o-1', name: 'Sherset MChJ' },
    salesCount: 3,
    salesSumMinor: '150000',
    openingCashMinor: '0',
    openMinutes: 180,
    staleWarnHours: 12,
    stale: false,
    ...over,
  } as CurrentSession;
}

/** `formatMoney` ming ajratgichi — uzilmas bo'shliq; taqqoslashda normallashtiriladi. */
const norm = (s: string | null | undefined) => (s ?? '').replace(/[   ]/g, ' ');

function renderHeader(over: Partial<PosHeaderProps> = {}, children?: React.ReactNode) {
  const props: PosHeaderProps = {
    session: SESSION(),
    shiftAge: '3 soat',
    connectionOk: true,
    ...over,
  };
  renderWithProviders(<PosHeader {...props}>{children}</PosHeader>);
  return props;
}

describe('PosHeader — logotip va smena-chip', () => {
  it('SHERSET matn-logotipi ko‘rinadi', () => {
    renderHeader();
    expect(screen.getByTestId('pos-header-logo')).toHaveTextContent('SHERSET');
  });

  it('smena-chip: kassir ismi, yoshi va savdo jami', () => {
    renderHeader();
    const chip = screen.getByTestId('pos-header-shift-chip');
    expect(within(chip).getByText('Kassir Aliyev')).toBeInTheDocument();
    expect(norm(chip.textContent)).toContain('3 soat');
    // «savdo» so'zi ATAYLAB: smena-mode'dagi «3 ta · …» yozuvi bilan matn
    // to'qnashmasin — MK32 testi uni `getByText(/3 ta ·/)` bilan yakka topadi.
    expect(norm(chip.textContent)).toContain('3 ta savdo · 1 500,00 сум');
  });

  it('`stale` da chip sariq holatga o‘tadi', () => {
    renderHeader({ session: SESSION({ stale: true }) });
    expect(screen.getByTestId('pos-header-shift-chip')).toHaveAttribute('data-stale', 'true');
  });

  it('yangi smenada chip sariq EMAS', () => {
    renderHeader();
    expect(screen.getByTestId('pos-header-shift-chip')).toHaveAttribute('data-stale', 'false');
  });
});

describe('PosHeader — aloqa indikatori', () => {
  it('`connectionOk=false` da qizil holat + «aloqa yo‘q» matni', () => {
    renderHeader({ connectionOk: false });
    const ind = screen.getByTestId('pos-header-conn');
    expect(ind).toHaveAttribute('data-ok', 'false');
    expect(screen.getByText("Server bilan aloqa yo'q")).toBeInTheDocument();
  });

  it('aloqa bor holatda «aloqa yo‘q» matni chizilmaydi', () => {
    renderHeader({ connectionOk: true });
    expect(screen.getByTestId('pos-header-conn')).toHaveAttribute('data-ok', 'true');
    expect(screen.queryByText("Server bilan aloqa yo'q")).not.toBeInTheDocument();
  });
});

describe('PosHeader — qobiq shartnomalari', () => {
  it('o‘ng chetdagi children sloti chiziladi (F6 oyna-tugmalari joyi)', () => {
    renderHeader({}, <button type="button" data-test-id="f6-slot-probe" />);
    expect(screen.getByTestId('f6-slot-probe')).toBeInTheDocument();
  });

  it('header `position: fixed` ishlatmaydi (klaviatura-evristika sharti)', () => {
    renderHeader();
    const header = screen.getByTestId('pos-header');
    expect(header.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    expect(header.style.position).not.toBe('fixed');
  });
});

// F9 (2026-08-15) — spec §3.1: versiya-badge endi headerning O'ZIDA
// (F2/F6 chala-ishi yopildi; sahifadagi suzuvchi nusxa olib tashlangan).
describe('PosHeader — versiya-badge headerda (F9, spec §3.1)', () => {
  afterEach(() => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
  });

  it('qobiqda badge header ICHIDA chiziladi (fixed emas)', async () => {
    (window as unknown as { electronAPI?: unknown }).electronAPI = {
      isSherset: true,
      version: '1.8.0',
    };
    renderHeader();
    const header = screen.getByTestId('pos-header');
    await waitFor(() =>
      expect(within(header).getByTestId('shell-version-badge')).toBeInTheDocument(),
    );
    expect(within(header).getByTestId('shell-version-badge').className).not.toMatch(
      /(^|\s)fixed(\s|$)/,
    );
  });

  it('brauzerda (qobiqsiz) headerda badge yo`q — joy band qilinmaydi', () => {
    renderHeader();
    expect(screen.queryByTestId('shell-version-badge')).not.toBeInTheDocument();
  });
});
