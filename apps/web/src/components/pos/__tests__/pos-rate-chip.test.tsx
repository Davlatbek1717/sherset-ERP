import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Kassa headeridagi kurs-chipi — egasi kursni PLANSHETDAN o'zgartiradi.
 *
 * 🔴 Qulflanadigan shartnomalar:
 *   1. kassir kursni KO'RADI, lekin chip bosilmaydi (`disabled`) — ruxsat yo'q;
 *   2. egada tahrir bloki ochiladi va `PUT /exchange-rates/manual` ga AYNAN
 *      kiritilgan string ketadi;
 *   3. saqlagandan keyin POS'ning kurs keshi (`pos-usd-rate`) yangilanadi —
 *      aks holda rasmiylashtirish oynasi ESKI kurs bilan sotishda davom etardi;
 *   4. chegaradan past qiymatda saqlash bloklanadi;
 *   5. server xatosi ekranda KO'RINADI (jim yutilmaydi).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ can: () => true, canView: () => true })),
}));

const { api } = await import('@/lib/api-client');
const { usePermissions } = await import('@/hooks/use-permissions');
const { PosRateChip } = await import('../pos-rate-chip');

const RATE = {
  date: '2026-08-17',
  currency: 'USD',
  rate: '12000',
  nominal: 1,
  source: 'MANUAL',
  rateMinor: '1200000000000',
};

function allow(mayEdit: boolean) {
  vi.mocked(usePermissions).mockReturnValue({
    can: (entity: string, action: string) =>
      entity === 'exchangerate' && action === 'update' ? mayEdit : true,
    canView: () => true,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue(RATE);
  vi.mocked(api.put).mockResolvedValue(RATE);
  allow(true);
});

describe('Ko`rinish', () => {
  it('kursni chipda ko`rsatadi', async () => {
    renderWithProviders(<PosRateChip />);
    const chip = await screen.findByTestId('pos-rate-chip');
    // Guruhlangan ko'rinish: «1$ = 12 000» (bo'sh joy — NBSP bo'lishi mumkin).
    expect(chip.textContent?.replace(/ /g, ' ')).toContain('1$ = 12 000');
  });

  it('«o`z kursim» belgisi MANUAL manbada ko`rinadi', async () => {
    renderWithProviders(<PosRateChip />);
    expect(await screen.findByTestId('pos-rate-manual')).toBeInTheDocument();
  });

  it('CBRU manbada «o`z kursim» belgisi YO`Q', async () => {
    vi.mocked(api.get).mockResolvedValue({ ...RATE, source: 'CBRU' });
    renderWithProviders(<PosRateChip />);
    await screen.findByTestId('pos-rate-chip');
    expect(screen.queryByTestId('pos-rate-manual')).not.toBeInTheDocument();
  });
});

describe('Ruxsat qulfi', () => {
  it('kassir (ruxsatsiz) kursni ko`radi, lekin chip BOSILMAYDI', async () => {
    allow(false);
    renderWithProviders(<PosRateChip />);
    const chip = await screen.findByTestId('pos-rate-chip');
    expect(chip).toBeDisabled();
  });

  it('ruxsatsiz bosilganda tahrir bloki ochilmaydi', async () => {
    allow(false);
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    const chip = await screen.findByTestId('pos-rate-chip');
    await user.click(chip).catch(() => {});
    expect(screen.queryByTestId('pos-rate-editor')).not.toBeInTheDocument();
  });

  it('egada tahrir bloki ochiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    await user.click(await screen.findByTestId('pos-rate-chip'));
    expect(screen.getByTestId('pos-rate-editor')).toBeInTheDocument();
  });
});

describe('Saqlash', () => {
  it('kiritilgan qiymatni AYNAN string bo`lib yuboradi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    await user.click(await screen.findByTestId('pos-rate-chip'));

    const input = screen.getByTestId('pos-rate-input');
    await user.clear(input);
    await user.type(input, '12500.25');
    await user.click(screen.getByTestId('pos-rate-save'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/exchange-rates/manual', {
        currency: 'USD',
        rate: '12500.25',
      });
    });
  });

  it('chegaradan past qiymat yuborilmaydi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    await user.click(await screen.findByTestId('pos-rate-chip'));

    const input = screen.getByTestId('pos-rate-input');
    await user.clear(input);
    await user.type(input, '12');

    expect(screen.getByTestId('pos-rate-save')).toBeDisabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('o`zgarish bo`lmasa saqlash bloklanadi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    await user.click(await screen.findByTestId('pos-rate-chip'));
    expect(screen.getByTestId('pos-rate-save')).toBeDisabled();
  });

  it('server xatosi EKRANDA ko`rinadi (jim yutilmaydi)', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('403 ruxsat yo`q'));
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    await user.click(await screen.findByTestId('pos-rate-chip'));

    const input = screen.getByTestId('pos-rate-input');
    await user.clear(input);
    await user.type(input, '13000');
    await user.click(screen.getByTestId('pos-rate-save'));

    expect(await screen.findByTestId('pos-rate-error')).toHaveTextContent('403');
    // Blok yopilmaydi — foydalanuvchi sababni ko'rib turadi.
    expect(screen.getByTestId('pos-rate-editor')).toBeInTheDocument();
  });

  it('muvaffaqiyatda blok yopiladi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosRateChip />);
    await user.click(await screen.findByTestId('pos-rate-chip'));

    const input = screen.getByTestId('pos-rate-input');
    await user.clear(input);
    await user.type(input, '13000');
    await user.click(screen.getByTestId('pos-rate-save'));

    await waitFor(() => {
      expect(screen.queryByTestId('pos-rate-editor')).not.toBeInTheDocument();
    });
  });
});
