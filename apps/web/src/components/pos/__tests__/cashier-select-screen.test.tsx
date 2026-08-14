import { CashierSelectScreen } from '@/components/pos/cashier-select-screen';
import { api } from '@/lib/api-client';
import { acceptAuthResponse, logout } from '@/lib/auth-store';
import { isPosWorkstation, readPosDevice } from '@/lib/pos-device';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { QueryClient } from '@tanstack/react-query';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F8 (POS redizayn, spec §8) — kassir-tanlash ekrani.
 *
 * Shartnoma (F7 server hisoboti bilan juft):
 *   - `GET /auth/pos-pin/candidates` → `{ cashiers: [{ employeeId, name }] }`
 *     — katta kartalar; PIN yoki boshqa sir kelmaydi ham, so'ralmaydi ham.
 *   - Karta → PIN bosqichi: MAVJUD `PinKeypad` (sahifa tugmalari) —
 *     «aynan bitta numpad» invarianti (P6): bu ekranda <input> BO'LMASLIGI
 *     shart, aks holda monoblokda qobiq klaviaturasi bilan IKKI panel chiqadi.
 *   - `POST /auth/pos-pin/switch` muvaffaqiyati → javob AYNAN `pos-login`
 *     shakli → `acceptAuthResponse` (auth-store) + butun react-query kesh
 *     invalidatsiyasi (yangi shaxs — `smena-mine` qayta so'raladi) → `onSwitched`.
 *   - 401 + `remaining` → qolgan urinishlar ko'rinadi, PIN tozalanadi;
 *     401 + `lockout` → to'liq logout (pos-pin-lock xulqi bilan bir xil).
 *   - Ekran FAQAT kassa ish o'rnida (`isPosWorkstation`) chiziladi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/auth-store', () => ({
  acceptAuthResponse: vi.fn(),
  logout: vi.fn(async () => undefined),
}));

vi.mock('@/lib/pos-device', () => ({
  isPosWorkstation: vi.fn(() => true),
  isShersetShell: vi.fn(() => false),
  readPosDevice: vi.fn(() => null),
}));

const CANDIDATES = {
  cashiers: [
    { employeeId: 'emp-1', name: 'Alisher Kassir' },
    { employeeId: 'emp-2', name: 'Bobur Kassir' },
  ],
};

const AUTH_RESPONSE = {
  accessToken: 'new-token',
  user: { id: 'emp-2', name: 'Bobur Kassir', uiMode: 'kiosk' },
};

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

async function typePin(pin: string): Promise<void> {
  for (const d of pin) {
    await userEvent.click(screen.getByRole('button', { name: d }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  (isPosWorkstation as Mock).mockReturnValue(true);
  (readPosDevice as Mock).mockReturnValue(null);
  (api.get as Mock).mockResolvedValue(CANDIDATES);
  (api.post as Mock).mockResolvedValue(AUTH_RESPONSE);
});

describe('CashierSelectScreen — kandidat kartalari', () => {
  it('kandidatlar katta karta bo`lib chiziladi (ism + bosh harf)', async () => {
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);
    expect(await screen.findByText('Alisher Kassir')).toBeTruthy();
    expect(screen.getByText('Bobur Kassir')).toBeTruthy();
    // Bosh harf doiralari
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/auth/pos-pin/candidates');
  });

  it('kandidat yo`q bo`lsa bo`sh-holat matni', async () => {
    (api.get as Mock).mockResolvedValue({ cashiers: [] });
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);
    expect(await screen.findByTestId('cashier-select-empty')).toBeTruthy();
  });

  it('🔴 kassa ish o`rni BO`LMASA ekran umuman chizilmaydi', () => {
    (isPosWorkstation as Mock).mockReturnValue(false);
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);
    expect(screen.queryByTestId('cashier-select-screen')).toBeNull();
    // Kandidat so'rovi ham ketmasin — ekran yo'q joyda ro'yxat oqmasin.
    expect(api.get).not.toHaveBeenCalled();
  });

  it('`onCancel` berilsa «Bekor» yo`li bor va chaqiradi', async () => {
    const onCancel = vi.fn();
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} onCancel={onCancel} />);
    await screen.findByText('Alisher Kassir');
    await userEvent.click(screen.getByTestId('cashier-select-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('CashierSelectScreen — PIN bosqichi (bitta-numpad invarianti)', () => {
  it('karta bosilsa PIN bosqichi ochiladi: PinKeypad tugmalari BOR, <input> YO`Q', async () => {
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);
    await userEvent.click(await screen.findByText('Bobur Kassir'));

    // Sahifaning o'z raqam tugmalari — kiritish yo'li.
    const digits = [...document.querySelectorAll('button')].filter((b) =>
      /^[0-9]$/.test(b.textContent ?? ''),
    );
    expect(digits.length).toBe(10);
    // 🔴 P6: <input>/<textarea> bo'lsa qobiq klaviaturasi ham chiqadi — IKKI numpad.
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0);
    // Tanlangan kassir nomi ko'rinadi (kim uchun PIN terilyapti).
    expect(screen.getAllByText(/Bobur Kassir/).length).toBeGreaterThan(0);
  });

  it('«Ortga» kartalarga qaytaradi (PIN tozalanadi)', async () => {
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);
    await userEvent.click(await screen.findByText('Bobur Kassir'));
    await userEvent.click(screen.getByTestId('cashier-select-back'));
    expect(screen.getByText('Alisher Kassir')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '5' })).toBeNull();
  });
});

describe('CashierSelectScreen — switch oqimi', () => {
  it('to`g`ri PIN → switch → acceptAuthResponse + kesh invalidatsiyasi + onSwitched', async () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const onSwitched = vi.fn();
    renderWithProviders(<CashierSelectScreen onSwitched={onSwitched} />, { queryClient: qc });

    await userEvent.click(await screen.findByText('Bobur Kassir'));
    await typePin('1234');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));

    await waitFor(() => expect(onSwitched).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/auth/pos-pin/switch', {
      employeeId: 'emp-2',
      pin: '1234',
    });
    // Token avval auth-store'ga, keyin kesh invalidatsiyasi, oxirida onSwitched.
    expect(acceptAuthResponse).toHaveBeenCalledWith(AUTH_RESPONSE);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('qurilma kaliti bor bo`lsa switch tanasiga qo`shiladi (eski juftlangan o`rnatma)', async () => {
    (readPosDevice as Mock).mockReturnValue({
      deviceId: 'dev-1',
      deviceSecret: 'sec-1',
      name: 'Kassa-1',
    });
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);
    await userEvent.click(await screen.findByText('Alisher Kassir'));
    await typePin('1234');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/pos-pin/switch', {
        employeeId: 'emp-1',
        pin: '1234',
        deviceId: 'dev-1',
        deviceSecret: 'sec-1',
      }),
    );
  });

  it('401 + remaining → qolgan urinish soni ko`rinadi, onSwitched CHAQIRILMAYDI', async () => {
    const err = Object.assign(new Error('PIN noto‘g‘ri'), {
      status: 401,
      body: { remaining: 3 },
    });
    (api.post as Mock).mockRejectedValue(err);
    const onSwitched = vi.fn();
    renderWithProviders(<CashierSelectScreen onSwitched={onSwitched} />);

    await userEvent.click(await screen.findByText('Bobur Kassir'));
    await typePin('1111');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));

    // pages.posLock.wrong_remaining — pos-pin-lock bilan BITTA kalit.
    expect(await screen.findByText(/Qolgan urinish: 3/)).toBeTruthy();
    expect(onSwitched).not.toHaveBeenCalled();
    expect(acceptAuthResponse).not.toHaveBeenCalled();
  });

  it('401 + lockout → to`liq logout (pos-pin-lock xulqi)', async () => {
    const err = Object.assign(new Error('Bloklandi'), {
      status: 401,
      body: { lockout: true },
    });
    (api.post as Mock).mockRejectedValue(err);
    renderWithProviders(<CashierSelectScreen onSwitched={() => undefined} />);

    await userEvent.click(await screen.findByText('Bobur Kassir'));
    await typePin('1111');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(acceptAuthResponse).not.toHaveBeenCalled();
  });
});
