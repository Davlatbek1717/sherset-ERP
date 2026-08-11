import { api } from '@/lib/api-client';
import { renderWithProviders, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmenaAssignSection } from './smena-assign-section';

/**
 * P11 — xodim kartasidagi «Kassa smenasi» bo'limi.
 *
 * Qulflanadigan bug-klasslar:
 *   1. 🔴 bo'lim UMUMAN yo'q edi — `SmenaEmployee` qatorini UI'dan qo'yish
 *      imkoni bo'lmagani uchun yangi kassir POS smenasini ocha olmasdi
 *      («Siz bu smenaga biriktirilmagansiz»). Shuning uchun test SIM
 *      («ekran chiqdimi») emas, aynan YOZUV shartnomasini tekshiradi.
 *   2. 🔴 saqlash tanlangan ro'yxatni TO'LIQ yuborishi shart — bittasini
 *      olib tashlash ham serverga yetib borishi kerak (PUT almashtiradi).
 *   3. 🟠 smena yo'q hisobda ekran «bo'sh» qolib ketmasin — zanjirni davom
 *      ettiradigan havola («Smenalar va jadvallar») doim ko'rinadi, aks holda
 *      egasi smena yaratadigan sahifani topa olmaydi (u menyuda yo'q).
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

const SM_A = 'sm-a';
const SM_B = 'sm-b';

function mockSmenas(smenaIds: string[], items = 2) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/admin/smenas/employee/e1') {
      return {
        items: [
          {
            id: SM_A,
            name: 'Kunduzgi',
            schedule: { name: 'Kunduz', startTime: '09:00', endTime: '18:00' },
            organization: { name: 'Demo' },
          },
          {
            id: SM_B,
            name: 'Tungi',
            schedule: { name: 'Tun', startTime: '22:00', endTime: '06:00' },
            organization: { name: 'Demo' },
          },
        ].slice(0, items),
        smenaIds,
      };
    }
    return {};
  });
}

describe('SmenaAssignSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.put).mockResolvedValue({ items: [], smenaIds: [] });
  });

  it('server holatini belgilangan katakcha sifatida ko`rsatadi', async () => {
    mockSmenas([SM_B]);
    renderWithProviders(<SmenaAssignSection employeeId="e1" />);

    const b = await screen.findByTestId(`employee-smena-${SM_B}`);
    await waitFor(() => expect(b).toBeChecked());
    expect(screen.getByTestId(`employee-smena-${SM_A}`)).not.toBeChecked();
  });

  it('biriktirish → PUT to`liq ro`yxat bilan ketadi', async () => {
    mockSmenas([]);
    renderWithProviders(<SmenaAssignSection employeeId="e1" />);

    await userEvent.click(await screen.findByTestId(`employee-smena-${SM_A}`));
    await userEvent.click(screen.getByTestId('employee-smena-save'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/smenas/employee/e1', { smenaIds: [SM_A] }),
    );
  });

  it('belgini olib tashlash ham yuboriladi (bo`sh ro`yxat = uzish)', async () => {
    mockSmenas([SM_A]);
    renderWithProviders(<SmenaAssignSection employeeId="e1" />);

    const a = await screen.findByTestId(`employee-smena-${SM_A}`);
    await waitFor(() => expect(a).toBeChecked());
    await userEvent.click(a);
    await userEvent.click(screen.getByTestId('employee-smena-save'));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/smenas/employee/e1', { smenaIds: [] }),
    );
  });

  it('o`zgarishsiz holatda saqlash tugmasi o`chiq', async () => {
    mockSmenas([SM_A]);
    renderWithProviders(<SmenaAssignSection employeeId="e1" />);
    await waitFor(() => expect(screen.getByTestId('employee-smena-save')).toBeDisabled());
  });

  it('smena yo`q hisobda ham smena yaratish havolasi ko`rinadi', async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], smenaIds: [] });
    renderWithProviders(<SmenaAssignSection employeeId="e1" />);

    expect(await screen.findByTestId('employee-smena-empty')).toBeInTheDocument();
    expect(screen.getByTestId('employee-smena-manage')).toHaveAttribute('href', '/settings/smena');
  });
});
