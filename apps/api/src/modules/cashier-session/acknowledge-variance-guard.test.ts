import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from './cashier-session.service.js';

/**
 * Farq aktini tan olish — O'Z-O'ZINI TASDIQLASH taqiqi.
 *
 * Endpoint faqat `cashiersession.update` talab qiladi, bu ruxsat kassir
 * shablonida ham bor. Demak kassir O'Z kamomad aktini o'zi «ko'rildi» qila
 * olardi — akt dalil bo'lishdan to'xtardi (kim yo'qotgan bo'lsa, o'sha
 * «ko'rdim» deb yopib qo'yadi). Qoida: aktdagi `cashierId` bilan chaqiruvchi
 * teng bo'lsa — 403, ruxsatidan qat'i nazar.
 */

const ACC = 'acc-1';
const VAR_ID = 'var-1';
const CASHIER = 'cash-1';
const MANAGER = 'mgr-1';

function makeService(opts: { acknowledgedAt?: Date | null } = {}) {
  const update = vi
    .fn()
    .mockResolvedValue({ id: VAR_ID, acknowledgedAt: new Date('2026-08-10T10:00:00Z') });
  const client = {
    cashierSessionVariance: {
      findFirst: vi.fn().mockResolvedValue({
        id: VAR_ID,
        acknowledgedAt: opts.acknowledgedAt ?? null,
        cashierId: CASHIER,
      }),
      update,
    },
  };
  const service = new CashierSessionService({ client } as never);
  return { service, update };
}

describe('acknowledgeVariance — o`z aktini o`zi tasdiqlay olmaydi', () => {
  it('aktdagi kassir o`zi ack qilsa → 403, yozuv YOZILMAYDI', async () => {
    const { service, update } = makeService();
    await expect(service.acknowledgeVariance(ACC, CASHIER, VAR_ID, { note: 'ok' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('allaqachon tan olingan aktda ham kassirning izoh-yangilashi 403', async () => {
    // Aks holda kassir «izoh yangilash» yo'li orqali menejer izohini yozardi.
    const { service, update } = makeService({ acknowledgedAt: new Date('2026-08-09T09:00:00Z') });
    await expect(
      service.acknowledgeVariance(ACC, CASHIER, VAR_ID, { note: 'meniki' }),
    ).rejects.toThrow(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('boshqa xodim (menejer) → o`tadi', async () => {
    const { service, update } = makeService();
    const res = (await service.acknowledgeVariance(ACC, MANAGER, VAR_ID, { note: 'sabab' })) as {
      changed: boolean;
    };
    expect(res.changed).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toMatchObject({ acknowledgedById: MANAGER });
  });
});
