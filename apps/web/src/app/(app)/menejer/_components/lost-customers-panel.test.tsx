import { api } from '@/lib/api-client';
import { renderWithProviders, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LostCustomersPanel } from './lost-customers-panel';

/**
 * MK17 — «yo'qolgan mijozlar» paneli (4M TZ §8.1/3).
 *
 * Ekranda ko'rinishi SHART bo'lgan shartnomalar:
 *  · «hech qachon xarid qilmagan» alohida sanaladi (yo'qolgan EMAS);
 *  · davr qayerdan kelgani ochiq (registr sukutimi / akkaunt sozlamasimi);
 *  · davr egalik taymeridan uzun bo'lsa — OGOHLANTIRISH ko'rinadi;
 *  · sabab belgilanmagan mijoz jimgina «sababi bor» bo'lib ketmaydi.
 */

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

function result(over: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        counterpartyId: 'cp-1',
        name: 'Romashka MChJ',
        phone: null,
        ownerId: 'emp-1',
        ownerName: 'Anna',
        firstPurchaseAt: '2025-01-01T00:00:00.000Z',
        lastPurchaseAt: '2026-04-01T00:00:00.000Z',
        purchaseCount: 7,
        inactiveDays: 131,
        bucket: 'lost',
        reasonCode: 'price',
        reasonRaw: 'price',
        reasonNote: 'Qimmat dedi',
        reasonAt: '2026-08-01T00:00:00.000Z',
        reasonAuthorName: 'Anna',
        releaseDue: true,
      },
      {
        counterpartyId: 'cp-2',
        name: 'Vasilek MChJ',
        phone: null,
        ownerId: null,
        ownerName: null,
        firstPurchaseAt: '2026-01-01T00:00:00.000Z',
        lastPurchaseAt: '2026-06-01T00:00:00.000Z',
        purchaseCount: 1,
        inactiveDays: 70,
        bucket: 'lost',
        reasonCode: null,
        reasonRaw: null,
        reasonNote: null,
        reasonAt: null,
        reasonAuthorName: null,
        releaseDue: false,
      },
    ],
    summary: {
      lostCount: 2,
      activeCount: 5,
      neverPurchasedCount: 3,
      byOwner: [
        { ownerId: 'emp-1', ownerName: 'Anna', lostCount: 1 },
        { ownerId: null, ownerName: null, lostCount: 1 },
      ],
      byReason: [{ code: 'price', count: 1 }],
      unmarkedCount: 1,
      releaseDueCount: 1,
      ownershipConflict: false,
    },
    config: {
      lostDays: 60,
      lostDaysConfigured: false,
      lostSignalEnabled: true,
      ownershipReleaseDays: 90,
      lostDaysRejectReason: null,
    },
    totalCount: 2,
    truncated: false,
    generatedAt: '2026-08-10T09:00:00.000Z',
    ...over,
  };
}

function mockList(payload: unknown) {
  vi.mocked(api.get).mockImplementation(async () => payload);
}

describe('LostCustomersPanel', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
    mockList(result());
  });

  it('«hech qachon xarid qilmagan» yo`qolganlardan ALOHIDA sanaladi', async () => {
    renderWithProviders(<LostCustomersPanel />);
    const box = await screen.findByTestId('lc-summary');
    // 2 yo'qolgan · 3 hech qachon xarid qilmagan — ikkalasi ham ko'rinadi va
    // qo'shilib ketmaydi.
    expect(box.textContent).toMatch(/2/);
    expect(box.textContent).toMatch(/3/);
  });

  it('davr manbai ochiq: sozlanmagan bo`lsa shu aytiladi', async () => {
    renderWithProviders(<LostCustomersPanel />);
    const src = await screen.findByTestId('lc-period-source');
    expect(src.textContent).toMatch(/sukut|умолчан/i);
  });

  it('sozlama RAD ETILGAN bo`lsa sabab ko`rinadi (jimgina sukut emas)', async () => {
    mockList(
      result({
        config: {
          lostDays: 60,
          lostDaysConfigured: false,
          lostSignalEnabled: true,
          ownershipReleaseDays: 90,
          lostDaysRejectReason: 'unit_mismatch',
        },
      }),
    );
    renderWithProviders(<LostCustomersPanel />);
    expect((await screen.findByTestId('lc-reject')).textContent).toMatch(/unit_mismatch/);
  });

  it('signal o`chirilgan bo`lsa bo`sh jadval SABABI bilan ko`rsatiladi', async () => {
    mockList(
      result({
        rows: [],
        config: {
          lostDays: 60,
          lostDaysConfigured: true,
          lostSignalEnabled: false,
          ownershipReleaseDays: 90,
          lostDaysRejectReason: null,
        },
      }),
    );
    renderWithProviders(<LostCustomersPanel />);
    expect(await screen.findByTestId('lc-disabled')).toBeTruthy();
  });

  it('davr egalik taymeridan uzun bo`lsa OGOHLANTIRISH chiqadi', async () => {
    mockList(
      result({
        summary: { ...result().summary, ownershipConflict: true },
        config: {
          lostDays: 120,
          lostDaysConfigured: true,
          lostSignalEnabled: true,
          ownershipReleaseDays: 90,
          lostDaysRejectReason: null,
        },
      }),
    );
    renderWithProviders(<LostCustomersPanel />);
    const warn = await screen.findByTestId('lc-conflict');
    expect(warn.textContent).toMatch(/120/);
    expect(warn.textContent).toMatch(/90/);
  });

  it('sababi belgilanmagan mijoz OCHIQ «belgilanmagan» deb turadi', async () => {
    renderWithProviders(<LostCustomersPanel />);
    const row = await screen.findByTestId('lc-row-cp-2');
    expect(row.textContent).toMatch(/belgilanmagan|не указана/i);
  });

  it('egalik muddati o`tgan mijozda belgi bor, lekin u kesimdan chiqmaydi', async () => {
    renderWithProviders(<LostCustomersPanel />);
    expect(await screen.findByTestId('lc-release-cp-1')).toBeTruthy();
    // Anna kesimida hamon 1 ta mijoz turibdi.
    expect((await screen.findByTestId('lc-by-owner')).textContent).toMatch(/Anna: 1/);
  });

  it('sabab belgilash mijozning izoh jurnaliga yuboriladi', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true, noteId: 'n-1', at: '', code: 'quality' });
    renderWithProviders(<LostCustomersPanel />);
    await userEvent.click(await screen.findByTestId('lc-mark-cp-2'));
    await userEvent.selectOptions(await screen.findByTestId('lc-reason-select'), 'quality');
    await userEvent.click(await screen.findByTestId('lc-reason-save'));

    expect(api.post).toHaveBeenCalledWith('/manager/customers/lost-reason', {
      counterpartyId: 'cp-2',
      code: 'quality',
      note: null,
    });
  });

  it('davrni saqlash MK13 registriga ketadi (ikkinchi sozlama manbai yo`q)', async () => {
    vi.mocked(api.put).mockResolvedValue({ thresholds: [] });
    renderWithProviders(<LostCustomersPanel />);
    const input = await screen.findByTestId('lc-period');
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    await userEvent.click(await screen.findByTestId('lc-period-save'));

    expect(api.put).toHaveBeenCalledWith('/manager/thresholds/LOST_CUSTOMER_DAYS', { value: 45 });
  });
});
