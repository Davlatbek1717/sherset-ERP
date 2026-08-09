import { describe, expect, it, vi } from 'vitest';
import { EmailService } from './email.service.js';

/**
 * Faza Q11 — `INT-13` klassi `email` saveConfig'da.
 *
 * Bugacha: `email.service.ts:85,87` — `fromName: parsed.fromName ?? null`
 * va `replyTo: parsed.replyTo ?? null`. Ikkala maydon ham sxemada
 * `nullish()` (kelmasligi mumkin), shuning uchun ularsiz yuborilgan
 * yangilash (masalan faqat SMTP host/port o'zgartirilganda) saqlangan
 * «Кому отвечать» / jo'natuvchi nomini JIMGINA o'chirar edi.
 *
 * Shartnoma (telegram bilan bir xil): kelmagan (`undefined`) maydon
 * TEGILMAYDI; ataylab bo'sh string yuborilsa — schema uni `null` qiladi
 * va maydon TOZALANADI.
 */
const ROW = {
  id: 'e1',
  accountId: 'acc',
  provider: 'custom',
  fromName: 'Sherset',
  fromEmail: 'shop@example.com',
  replyTo: 'reply@example.com',
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  username: 'shop@example.com',
  passwordCipher: 'old-cipher',
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
    client: { emailConfig: { findFirst: vi.fn(async () => existing), update, create } },
  };
  const service = new EmailService(prisma as never);
  return { service, update, create };
}

/** Sxema majburiy qilgan minimal tana (fromName/replyTo YO'Q). */
const REQUIRED_ONLY = {
  fromEmail: 'shop@example.com',
  host: 'smtp.example.com',
  username: 'shop@example.com',
};

describe('EmailService.saveConfig — PATCH semantikasi (INT-13)', () => {
  it('fromName/replyTo yuborilmasa — ular TEGILMAYDI (NULL-reset yo‘q)', async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', REQUIRED_ONLY);

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('fromName');
    expect(data).not.toHaveProperty('replyTo');
    // Qolgan (majburiy) maydonlar odatdagidek yoziladi.
    expect(data.host).toBe('smtp.example.com');
  });

  it("ataylab bo'sh string yuborilsa maydon tozalanadi (null)", async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', { ...REQUIRED_ONLY, fromName: '', replyTo: '' });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.fromName).toBeNull();
    expect(data.replyTo).toBeNull();
  });

  it('berilgan qiymatlar yoziladi', async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', {
      ...REQUIRED_ONLY,
      fromName: 'Sherset ERP',
      replyTo: 'help@example.com',
    });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.fromName).toBe('Sherset ERP');
    expect(data.replyTo).toBe('help@example.com');
  });

  it('birinchi sozlashda parol majburiyligi saqlanadi', async () => {
    const { service, create } = makeService(null);
    await expect(service.saveConfig('acc', REQUIRED_ONLY)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
