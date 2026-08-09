import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramService } from './telegram.service.js';

/**
 * Faza 21 (`INT-01` / `AUTH-01`, HIGH) — inbound Telegram webhook
 * autentifikatsiyasi.
 *
 * Bugacha: `telegram-webhook.controller.ts:20` `x-telegram-bot-api-secret-token`
 * sarlavhasini `_secretHeader` deb OLARDI-yu hech qayerda solishtirmasdi va
 * controller'da @UseGuards yo'q edi ⇒ accountId'ni bilgan har kim
 * `POST /telegram-webhook/<accountId>` bilan `sa:` (supply-approval) callback
 * inject qilib qabulni tasdiqlashi yoki `business_connection` yuborib egasining
 * integratsiyasini o'chirishi mumkin edi.
 *
 * Shartnoma: secret mos kelmasa 401 va `handleInbound` UMUMAN chaqirilmaydi
 * (fail-closed — config yo'q / secret sozlanmagan / sarlavha yo'q holatlari ham).
 *
 * Prisma qo'lda mock (telegram.service.test.ts uslubi) — DB yo'q.
 */
function makeService(cfg: { webhookSecret: string | null; webhookUrl?: string | null } | null) {
  const findUnique = vi.fn(async () => cfg);
  const prisma = { client: { telegramConfig: { findUnique } } };
  const service = new TelegramService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, findUnique };
}

describe('TelegramService.assertWebhookSecret', () => {
  it("to'g'ri secret → o'tadi", async () => {
    const { service } = makeService({ webhookSecret: 'right-secret' });
    await expect(service.assertWebhookSecret('acc', 'right-secret')).resolves.toBeUndefined();
  });

  it("noto'g'ri secret → 401", async () => {
    const { service } = makeService({ webhookSecret: 'right-secret' });
    await expect(service.assertWebhookSecret('acc', 'wrong-secret')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("sarlavha umuman yo'q → 401", async () => {
    const { service } = makeService({ webhookSecret: 'right-secret' });
    await expect(service.assertWebhookSecret('acc', undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("config'da secret sozlanmagan (null) → 401, sarlavha yo'q bo'lsa ham (fail-closed)", async () => {
    const { service } = makeService({ webhookSecret: null });
    await expect(service.assertWebhookSecret('acc', undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.assertWebhookSecret('acc', '')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("akkaunt uchun TelegramConfig umuman yo'q → 401", async () => {
    const { service } = makeService(null);
    await expect(service.assertWebhookSecret('acc', 'anything')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('TelegramService.businessStatus — secret ko‘rinadigan bo‘lsin', () => {
  it("URL bor, secret yo'q → webhookSet:true LEKIN webhookSecretSet:false (jim 401 holati ko'rinadi)", async () => {
    const { service } = makeService({
      webhookSecret: null,
      webhookUrl: 'https://erp.example/api/v1/telegram-webhook/acc',
    });
    const st = await service.businessStatus('acc');
    expect(st.webhookSet).toBe(true);
    expect(st.webhookSecretSet).toBe(false);
  });

  it('ikkalasi ham bor → webhookSecretSet:true', async () => {
    const { service } = makeService({
      webhookSecret: 'live-secret',
      webhookUrl: 'https://erp.example/api/v1/telegram-webhook/acc',
    });
    const st = await service.businessStatus('acc');
    expect(st.webhookSecretSet).toBe(true);
  });
});

describe('TelegramWebhookController', () => {
  function makeController(assertImpl: () => Promise<void>) {
    const handleInbound = vi.fn(async () => ({ ok: true as const }));
    const svc = { assertWebhookSecret: vi.fn(assertImpl), handleInbound };
    return { ctl: new TelegramWebhookController(svc as never), svc, handleInbound };
  }

  it("secret rad etilsa handleInbound CHAQIRILMAYDI (in'eksiya oqimi uzilgan)", async () => {
    const { ctl, handleInbound } = makeController(async () => {
      throw new UnauthorizedException('Invalid webhook secret');
    });
    await expect(
      ctl.webhook('acc', 'bad', { callback_query: { id: '1', data: 'sa:approve:x' } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("to'g'ri secret → handleInbound accountId + update bilan chaqiriladi", async () => {
    const { ctl, svc, handleInbound } = makeController(async () => {});
    const update = { message: { text: 'salom' } };
    await expect(ctl.webhook('acc', 'good', update)).resolves.toEqual({ ok: true });
    expect(svc.assertWebhookSecret).toHaveBeenCalledWith('acc', 'good');
    expect(handleInbound).toHaveBeenCalledWith('acc', update);
  });
});
