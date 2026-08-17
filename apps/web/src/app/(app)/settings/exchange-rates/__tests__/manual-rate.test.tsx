import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «Sozlamalar → Valyuta kurslari» — kursni qo'lda o'zgartirish (egasi, 2026-08-17).
 *
 * 🔴 Qulflanadigan shartnomalar:
 *   1. amaldagi kurs va uning MANBASI ko'rinadi (kassa aynan shuni ishlatadi);
 *   2. `exchangerate.update` YO'Q bo'lsa o'zgartirish tugmasi UMUMAN chiqmaydi;
 *   3. saqlash `PUT /exchange-rates/manual` ga AYNAN kiritilgan STRING ni yuboradi
 *      (number ga aylantirmaydi — pul-kritik);
 *   4. chegaradan past qiymatda «Saqlash» bloklanadi (server ham rad etadi, bu UX qatlami);
 *   5. tarixda «nimadan nimaga, kim» ko'rinadi va ×10^8 qiymat odam o'qiydigan songa aylanadi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ can: () => true, canView: () => true })),
}));

const { api } = await import('@/lib/api-client');
const { usePermissions } = await import('@/hooks/use-permissions');
const Page = (await import('../page')).default;

const EFFECTIVE = {
  date: '2026-08-17',
  currency: 'USD',
  rate: '12000',
  nominal: 1,
  source: 'MANUAL',
  rateMinor: '1200000000000',
};

const CHANGES = [
  {
    at: '2026-08-17T06:00:00.000Z',
    before: '1200000000000',
    after: '1300000000000',
    userName: 'Admin',
    currency: 'USD',
  },
];

function wireApi(over: { changes?: unknown[]; effective?: unknown } = {}) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/exchange-rates/latest')) return [];
    if (path.startsWith('/exchange-rates/rate')) return over.effective ?? EFFECTIVE;
    if (path.startsWith('/exchange-rates/manual/changes')) return over.changes ?? CHANGES;
    throw new Error(`kutilmagan so'rov: ${path}`);
  });
  vi.mocked(api.put).mockResolvedValue(EFFECTIVE);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePermissions).mockReturnValue({
    can: () => true,
    canView: () => true,
  } as never);
});

describe('Amaldagi kurs', () => {
  it('kursni va manbasini ko`rsatadi', async () => {
    wireApi();
    renderWithProviders(<Page />);

    await waitFor(() => {
      expect(screen.getByTestId('effective-rate')).toHaveTextContent('12000');
    });
    // Kassa MANUAL qatordan o'qiydi — foydalanuvchi buni ko'rib turishi kerak.
    expect(screen.getByTestId('effective-source')).toBeInTheDocument();
  });

  it('kim o`zgartirganini ko`rsatadi', async () => {
    wireApi();
    renderWithProviders(<Page />);
    await waitFor(() => {
      expect(screen.getByTestId('effective-author')).toHaveTextContent('Admin');
    });
  });
});

describe('Ruxsat qulfi', () => {
  it('`exchangerate.update` YO`Q bo`lsa tugma umuman render qilinmaydi', async () => {
    wireApi();
    vi.mocked(usePermissions).mockReturnValue({
      can: (entity: string, action: string) => !(entity === 'exchangerate' && action === 'update'),
      canView: () => true,
    } as never);

    renderWithProviders(<Page />);
    await waitFor(() => {
      expect(screen.getByTestId('effective-rate')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manual-rate-open')).not.toBeInTheDocument();
  });

  it('ruxsat bo`lsa tugma bor', async () => {
    wireApi();
    renderWithProviders(<Page />);
    await waitFor(() => {
      expect(screen.getByTestId('manual-rate-open')).toBeInTheDocument();
    });
  });
});

describe('Kursni saqlash', () => {
  it('kiritilgan qiymatni AYNAN string bo`lib yuboradi', async () => {
    wireApi();
    const user = userEvent.setup();
    renderWithProviders(<Page />);

    await user.click(await screen.findByTestId('manual-rate-open'));
    const input = screen.getByTestId('manual-rate-input') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '12500.50');
    await user.click(screen.getByTestId('manual-rate-save'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/exchange-rates/manual', {
        currency: 'USD',
        rate: '12500.50',
      });
    });
  });

  it('eski → yangi taqqoslashni ko`rsatadi', async () => {
    wireApi();
    const user = userEvent.setup();
    renderWithProviders(<Page />);

    await user.click(await screen.findByTestId('manual-rate-open'));
    const input = screen.getByTestId('manual-rate-input');
    await user.clear(input);
    await user.type(input, '13000');

    expect(screen.getByTestId('manual-rate-diff')).toHaveTextContent('12000');
    expect(screen.getByTestId('manual-rate-diff')).toHaveTextContent('13000');
  });

  it('chegaradan past qiymatda saqlash BLOKLANADI va so`rov ketmaydi', async () => {
    wireApi();
    const user = userEvent.setup();
    renderWithProviders(<Page />);

    await user.click(await screen.findByTestId('manual-rate-open'));
    const input = screen.getByTestId('manual-rate-input');
    await user.clear(input);
    await user.type(input, '12'); // nol tushib qolgan holat

    expect(screen.getByTestId('manual-rate-save')).toBeDisabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('o`zgarish bo`lmasa saqlash bloklanadi (bekorga yozuv va audit qatori yaratmaydi)', async () => {
    wireApi();
    const user = userEvent.setup();
    renderWithProviders(<Page />);

    await user.click(await screen.findByTestId('manual-rate-open'));
    // Maydon amaldagi kurs bilan to'ldirilgan — tegmasak saqlash o'chiq.
    expect(screen.getByTestId('manual-rate-save')).toBeDisabled();
  });
});

describe('Tarix', () => {
  it('×10^8 qiymatni odam o`qiydigan songa aylantiradi', async () => {
    wireApi();
    renderWithProviders(<Page />);

    const row = await screen.findByTestId('rate-change-row');
    // 1200000000000 → 12 000 · 1300000000000 → 13 000 (xom son ko'rinmasin)
    expect(row.textContent).not.toContain('1200000000000');
    expect(row.textContent?.replace(/ /g, ' ')).toContain('12 000');
    expect(row.textContent?.replace(/ /g, ' ')).toContain('13 000');
  });
});
