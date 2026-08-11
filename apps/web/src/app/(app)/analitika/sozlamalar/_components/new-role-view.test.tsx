import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewRoleView } from './new-role-view';

/**
 * P11 — rol shabloni tanlash (`GET /roles/templates` + `POST /roles/:id/apply-template`).
 *
 * 🔴 Qulflanadigan bug-klass: `POST /roles` `uiMode` ni UMUMAN qabul qilmaydi,
 * ya'ni UI'dan yaratilgan har qanday rol `uiMode='full'` bo'lardi. «Kassir»
 * deb nomlangan rol butun ERP menyusini ochib turardi (kassa TZ §3.1) va
 * kiosk rejimini faqat ops-skript bera olardi. Shuning uchun test aynan
 * ikkinchi chaqiruv — shablonni QO'LLASH — ketishini tekshiradi, ekran
 * ko'rinishini emas.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const META = {
  entities: [{ key: 'retailsale', category: 'Sales' }],
  categories: ['Sales'],
  actions: ['view', 'create', 'update', 'delete', 'approve', 'print'],
  scopes: ['NO', 'OWN', 'OWN_AND_GROUP', 'ALL'],
};

const TEMPLATES = {
  items: [
    { slug: 'cashier', seedName: 'Kassir', description: 'Faqat kassa', uiMode: 'kiosk' },
    { slug: 'seller', seedName: 'Sotuvchi', description: 'B2B sotuvchi', uiMode: 'full' },
  ],
};

describe('NewRoleView — shablon tanlash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/roles/meta') return META;
      if (url === '/roles/templates') return TEMPLATES;
      return {};
    });
    vi.mocked(api.post).mockResolvedValue({ id: 'r1', version: 1 });
  });

  it('shablon ro`yxati serverdan keladi va kiosk belgilanadi', async () => {
    renderWithProviders(<NewRoleView />);
    const select = (await screen.findByTestId('role-template-select')) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain('Kassir — kiosk');
    expect(labels).toContain('Sotuvchi');
  });

  it('shablon tanlansa nom to`ldiriladi va saqlashda apply-template chaqiriladi', async () => {
    renderWithProviders(<NewRoleView />);
    const select = await screen.findByTestId('role-template-select');
    await userEvent.selectOptions(select, 'cashier');

    expect(await screen.findByTestId('role-template-hint')).toHaveTextContent('Faqat kassa');
    await userEvent.click(screen.getByRole('button', { name: /saqlash|сохранить/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/roles', expect.objectContaining({ name: 'Kassir' })),
    );
    // Ikkinchi chaqiruv — `uiMode='kiosk'` AYNAN shu yerdan keladi.
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/roles/r1/apply-template', {
        slug: 'cashier',
        version: 1,
      }),
    );
  });

  it('shablonsiz yaratishda apply-template CHAQIRILMAYDI', async () => {
    renderWithProviders(<NewRoleView />);
    await screen.findByTestId('role-template-select');
    const inputs = screen.getAllByRole('textbox');
    await userEvent.type(inputs[0] as HTMLElement, 'Oddiy rol');
    await userEvent.click(screen.getByRole('button', { name: /saqlash|сохранить/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/roles', expect.anything()));
    expect(vi.mocked(api.post).mock.calls.some(([u]) => String(u).includes('apply-template'))).toBe(
      false,
    );
  });
});
