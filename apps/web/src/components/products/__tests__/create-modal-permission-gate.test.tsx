import { renderWithProviders, screen, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ProductCreateModal — «product.create» ruxsati bo'lmaganda modal ham qo'riqlanadi.
 *
 * 🔴 Nega bu test bor (2026-08-23 auditi): `d7937657` prodda o'lchangan bugni
 * (allocate-code 403 `.catch(() => {})` da yutilib «Код» jimgina bo'sh qolishi,
 * xato esa faqat «Сохранить» da chiqishi) FAQAT `/products/new` sahifasida
 * tuzatgan. Ayni forma ikkinchi kirish nuqtasi — bu modal — chetda qolgan:
 * unda `usePermissions` umuman yo'q edi. Modal esa aynan B2B oqimlaridan
 * ochiladi (`supplies/new`, `demands/new`, `demands/[id]` — «Создать новый
 * товар "…"» havolasi), ya'ni prodda 403 bergan o'sha auditoriya.
 *
 * Qulflanadigan shartnomalar (sahifadagilarning aynan nusxasi):
 *   1. ruxsat yo'q → forma UMUMAN chiqmaydi, tushunarli rad xabari chiqadi;
 *   2. ruxsat yo'q → mahkum `allocate-code` so'rovi UMUMAN yuborilmaydi;
 *   3. ruxsat bor → forma chiqadi va «Код» oldindan olinadi.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/supplies/new',
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
const { ProductCreateModal } = await import('../product-create-modal');

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

function renderModal() {
  renderWithProviders(
    <ProductCreateModal open initialName="Kabel" onClose={() => {}} onCreated={() => {}} />,
  );
}

describe("ProductCreateModal — «product.create» qo'riqi", () => {
  it("ruxsat yo'q: forma o'rniga rad xabari, «Код» so'ralmaydi", async () => {
    wirePermissions(false);
    renderModal();

    await waitFor(() => expect(screen.getByText(/Нет прав|Ruxsat yo/i)).toBeInTheDocument());
    expect(screen.queryByTestId('product-create-modal-save')).not.toBeInTheDocument();
    const allocateCalls = vi
      .mocked(api.post)
      .mock.calls.filter((c) => String(c[0]).includes('allocate-code'));
    expect(allocateCalls).toHaveLength(0);
  });

  it('ruxsat bor: forma chiqadi va «Код» oldindan olinadi', async () => {
    wirePermissions(true);
    renderModal();

    await waitFor(() =>
      expect(screen.getByTestId('product-create-modal-save')).toBeInTheDocument(),
    );
    await waitFor(() => {
      const allocateCalls = vi
        .mocked(api.post)
        .mock.calls.filter((c) => String(c[0]).includes('allocate-code'));
      expect(allocateCalls).toHaveLength(1);
    });
  });
});
