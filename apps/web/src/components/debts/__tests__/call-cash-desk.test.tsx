/**
 * Qo'ng'iroq natijasi «To'ladi» + NAQD — pul QAYSI kassaga tushgani serverga
 * yuboriladi.
 *
 * 🔴 Egasi, 2026-08-19: «mijoz kartasida ko'rsatadi, lekin olingan pul ham
 * kassaga tushadi — u kassadagi pulga qo'shilishi kerak». Ilgari bu oyna
 * kassa haqida hech narsa yubormasdi va server ham yozmasdi: pul kassa
 * qoldig'ida ham, smenada ham ko'rinmasdi (prodda 5 to'lov, 44 947 075 so'm).
 *
 * Qulflanadigan shartnoma:
 *  · bir nechta faol kassa bo'lsa — tanlagich CHIZILADI va tanlangani ketadi;
 *  · bitta kassa bo'lsa — qo'shimcha qadam YO'Q, u avtomatik ketadi;
 *  · naqd bo'lmagan kanalda (Click) kassa YUBORILMAYDI.
 */

import { CallOutcomeForm } from '@/components/debts/call-outcome-modal';
import { api } from '@/lib/api-client';
import { debtApi } from '@/lib/debt-api';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DESK1 = { id: '44444444-4444-4444-4444-444444444444', name: 'Asosiy kassa' };
const DESK2 = { id: '55555555-5555-5555-5555-555555555555', name: 'Ombor kassasi' };

vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/lib/debt-api', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    debtApi: { markCall: vi.fn(async () => ({ id: 'debt-1' })) },
  };
});

function mountDesks(items: Array<{ id: string; name: string }>) {
  vi.mocked(api.get).mockImplementation(async () => ({ items }));
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(debtApi.markCall).mockClear();
});

/** «To'ladi» → «Naqd» yo'lini bosib o'tadi. */
async function pickPaidCash(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /To.ladi/ }));
  await user.click(await screen.findByRole('button', { name: /Naqd/ }));
}

describe('Qo‘ng‘iroq natijasi — naqd pul kassasi', () => {
  it('🔴 bir nechta kassa: tanlangan kassa serverga ketadi', async () => {
    const user = userEvent.setup();
    mountDesks([DESK1, DESK2]);
    renderWithProviders(
      <CallOutcomeForm debtId="debt-1" debtorName="Usta Vali" remainingMinor="4000000" />,
    );

    await pickPaidCash(user);
    const select = await screen.findByTestId('call-cash-desk');
    await user.selectOptions(select, DESK2.id);
    await user.click(screen.getByRole('button', { name: /Saqlash/ }));

    await waitFor(() => expect(debtApi.markCall).toHaveBeenCalled());
    expect(vi.mocked(debtApi.markCall).mock.calls[0]?.[1]).toMatchObject({
      paymentKind: 'cash',
      cashDeskId: DESK2.id,
    });
  });

  it('bitta kassa: tanlagich chizilmaydi, kassa baribir ketadi', async () => {
    const user = userEvent.setup();
    mountDesks([DESK1]);
    renderWithProviders(
      <CallOutcomeForm debtId="debt-1" debtorName="Usta Vali" remainingMinor="4000000" />,
    );

    await pickPaidCash(user);
    expect(screen.queryByTestId('call-cash-desk')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Saqlash/ }));

    await waitFor(() => expect(debtApi.markCall).toHaveBeenCalled());
    expect(vi.mocked(debtApi.markCall).mock.calls[0]?.[1]).toMatchObject({
      cashDeskId: DESK1.id,
    });
  });
});
