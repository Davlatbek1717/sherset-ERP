import { describe, expect, it, vi } from 'vitest';
import { PaymentGatewayService } from './payment-gateway.service.js';

/**
 * Faza Q11 — `INT-13` klassi `payment-gateway` saveConfig'da.
 *
 * Bugacha: `payment-gateway.service.ts:95` — `callbackUrl: parsed.callbackUrl ?? null`.
 * `callbackUrl` sxemada `.optional()` edi, ya'ni uni yubormagan yangilash
 * (masalan `testMode`ni o'chirish yoki creds rotatsiyasi) Payme/Click
 * callback URL'ini JIMGINA NULL qilardi. Bu endpointning WEB-UI'si yo'q —
 * chaqiruvchi tashqi/admin integratsiya, ya'ni qisman tana real ehtimol.
 *
 * Muhim nozik joy: eski sxemada `''` `url()` tekshiruvidan o'tmasdi ⇒
 * «ataylab tozalash»ning YAGONA yo'li maydonni tashlab yuborish edi.
 * Shu sababli PATCH-semantikaga o'tish sxemani ham o'zgartirishni talab
 * qiladi: `''` → `null` (telegram/sms'dagi `optionalEmpty` naqshi), aks
 * holda operator callback URL'ini umuman o'chira olmay qolardi.
 */
const ROW = {
  id: 'g1',
  accountId: 'acc',
  provider: 'payme',
  name: 'Payme',
  merchantId: 'm-1',
  credsCipher: 'old-cipher',
  testMode: true,
  callbackUrl: 'https://erp.example/api/v1/pay/payme',
  enabled: true,
  lastTxAt: null,
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
    client: {
      paymentGatewayConfig: { findUnique: vi.fn(async () => existing), update, create },
    },
  };
  const service = new PaymentGatewayService(prisma as never, {} as never);
  return { service, update, create };
}

const REQUIRED_ONLY = { provider: 'payme', name: 'Payme', merchantId: 'm-1' };

describe('PaymentGatewayService.saveConfig — PATCH semantikasi (INT-13)', () => {
  it('callbackUrl yuborilmasa — TEGILMAYDI (NULL-reset yo‘q)', async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', REQUIRED_ONLY);

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('callbackUrl');
    expect(data.merchantId).toBe('m-1');
  });

  it("ataylab bo'sh string yuborilsa callbackUrl tozalanadi (null)", async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', { ...REQUIRED_ONLY, callbackUrl: '' });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.callbackUrl).toBeNull();
  });

  it('berilgan qiymat yoziladi', async () => {
    const { service, update } = makeService(ROW);
    await service.saveConfig('acc', {
      ...REQUIRED_ONLY,
      callbackUrl: 'https://erp.example/api/v1/pay/payme2',
    });

    const data = update.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.callbackUrl).toBe('https://erp.example/api/v1/pay/payme2');
  });

  it("noto'g'ri URL baribir rad etiladi (bo'sh string istisnosi teshik ochmaydi)", async () => {
    const { service } = makeService(ROW);
    await expect(
      service.saveConfig('acc', { ...REQUIRED_ONLY, callbackUrl: 'not-a-url' }),
    ).rejects.toThrow();
  });

  it('birinchi sozlashda creds majburiyligi saqlanadi', async () => {
    const { service, create } = makeService(null);
    await expect(service.saveConfig('acc', REQUIRED_ONLY)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
