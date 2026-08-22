import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /products/new — «product.create» ruxsati bo'lmaganda sahifa qo'riqlanadi.
 *
 * 🔴 Nega bu test bor (prod 2026-08-22 da o'lchandi): sahifa ochilishida
 * `POST /products/allocate-code` «Код» ni oldindan oladi, va uning `.catch(() => {})`
 * i XATONI YUTARDI. Kassir/B2B akkauntida server 403 qaytargan (loglarda 4 marta),
 * shuning uchun «Код» maydoni JIMGINA bo'sh qolgan, xodim butun formani to'ldirgan
 * va faqat «Сохранить» bosganda 403 ni ko'rgan.
 *
 * Qulflanadigan shartnomalar:
 *   1. ruxsat yo'q → forma UMUMAN chiqmaydi, tushunarli rad xabari chiqadi;
 *   2. ruxsat yo'q → mahkum `allocate-code` so'rovi UMUMAN yuborilmaydi;
 *   3. ruxsat bor → forma chiqadi va «Код» oldindan olinadi (qo'riq to'sib qo'ymaydi).
 *
 * Haqiqiy qulf serverda — `@RequirePermission({ entity: 'product', action: 'create' })`;
 * bu qatlam faqat UX (`usePermissions` ataylab fail-open).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/products/new',
}));

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(() => ({ can: () => true, canView: () => true })),
}));

vi.mock('@/lib/auth-store', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'u-1', name: 'Admin' },
    accessToken: 't',
    initialized: true,
  })),
}));

const { api } = await import('@/lib/api-client');
const { usePermissions } = await import('@/hooks/use-permissions');
const Page = (await import('../page')).default;

function wirePermissions(canCreate: boolean) {
  vi.mocked(usePermissions).mockReturnValue({
    can: (entity: string, action: string) =>
      entity === 'product' && action === 'create' ? canCreate : true,
    canView: () => true,
  } as unknown as ReturnType<typeof usePermissions>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue([] as never);
  vi.mocked(api.post).mockResolvedValue({ code: '05107' } as never);
});

describe("/products/new — «product.create» qo'riqi", () => {
  it("ruxsat yo'q: forma o'rniga rad xabari chiqadi", async () => {
    wirePermissions(false);
    renderWithProviders(<Page />);
    expect(await screen.findByTestId('product-new-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('product-new-page')).not.toBeInTheDocument();
  });

  it("ruxsat yo'q: mahkum allocate-code so'rovi umuman yuborilmaydi", async () => {
    wirePermissions(false);
    renderWithProviders(<Page />);
    await screen.findByTestId('product-new-forbidden');
    // 403 ni yutib «Код» ni bo'sh qoldirgan chaqiruv — endi umuman bo'lmaydi
    const allocCalls = vi
      .mocked(api.post)
      .mock.calls.filter(([path]) => String(path).includes('allocate-code'));
    expect(allocCalls).toHaveLength(0);
  });

  it('ruxsat bor: forma chiqadi va «Код» oldindan olinadi', async () => {
    wirePermissions(true);
    renderWithProviders(<Page />);
    expect(await screen.findByTestId('product-new-page')).toBeInTheDocument();
    expect(screen.queryByTestId('product-new-forbidden')).not.toBeInTheDocument();
    await waitFor(() => {
      const allocCalls = vi
        .mocked(api.post)
        .mock.calls.filter(([path]) => String(path).includes('allocate-code'));
      expect(allocCalls).toHaveLength(1);
    });
  });
});
