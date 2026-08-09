import { describe, expect, it, vi } from 'vitest';
import { SmsService } from './sms.service.js';

/**
 * Faza Q11 — `INT-13` klassi `sms` saveConfig'da.
 *
 * Bugacha: `sms.service.ts:90` — `senderId: parsed.senderId ?? null`.
 * `senderId` sxemada `optionalEmpty(20)` (ya'ni kelmasligi ham mumkin),
 * shuning uchun uni yubormagan yangilash (parolni almashtirish yoki
 * provayderni o'zgartirish) tasdiqlangan sender-ID'ni JIMGINA o'chirardi
 * — keyingi SMS'lar hisob standart sender'i bilan ketadi.
 *
 * Shartnoma: kelmagan (`undefined`) maydon TEGILMAYDI; bo'sh string
 * (`''` → schema `null`) ataylab tozalaydi.
 */
const ROW = {
  id: 's1',
  accountId: 'acc',
  provider: 'eskiz',
  email: 'shop@example.com',
  passwordCipher: 'old-cipher',
  senderId: '4546',
  token: null,
  tokenIssuedAt: null,
  enabled: true,
  lastTestedAt: null,
  lastTestOk: null,
  lastTestMsg: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeService(existing: Record<string, unknown> | null) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...ROW,
    ...data,
  }));
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...ROW,
    ...data,
  }));
  const prisma = {
    client: { smsConfig: { findUnique: vi.fn(async () => existing), update, create } },
  };
  const service = new SmsService(prisma as never, {} as never);
  return { service, update, create };
}

const REQUIRED_ONLY = { email: 'shop@example.com' };

describe('SmsService.saveConfig — PATCH semantikasi (INT-13)', () => {
  it('senderId yuborilmasa — TEGILMAYDI (NULL-reset yo‘q)', async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', REQUIRED_ONLY);

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('senderId');
    expect(data.email).toBe('shop@example.com');
    // Token tozalash ataylab qoladi (saqlash = qayta-auth majburiyati).
    expect(data.token).toBeNull();
  });

  it("ataylab bo'sh string yuborilsa senderId tozalanadi (null)", async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', { ...REQUIRED_ONLY, senderId: '' });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.senderId).toBeNull();
  });

  it('berilgan qiymat yoziladi', async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', { ...REQUIRED_ONLY, senderId: 'SHERSET' });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.senderId).toBe('SHERSET');
  });

  it('birinchi sozlashda parol majburiyligi saqlanadi', async () => {
    const { service, create } = makeService(null);
    await expect(service.saveConfig('acc', REQUIRED_ONLY)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
