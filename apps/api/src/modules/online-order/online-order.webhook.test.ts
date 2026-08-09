import { createHmac } from 'node:crypto';
import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { encryptPassword } from '../email/crypto.js';
import { INBOUND_SIGNATURE_HEADER } from './online-order.inbound.js';
import { OnlineOrderService } from './online-order.service.js';
import { OnlineOrderWebhookController } from './online-order.webhook.controller.js';

/**
 * F042 — tashqi kanaldan buyurtma qabul qilish (2-bo'lim TZ §4.4).
 *
 * Shartnoma:
 *   1. **Imzo** — `X-Sherset-Signature` xom tana ustidan HMAC-SHA256, constant-time.
 *      Rad etilsa 401 va **hech qanday yozuv yaratilmaydi**; javob/log'da sir ham,
 *      kutilgan imzo ham chiqmaydi (aks holda 401 ning o'zi oracle bo'lardi).
 *   2. **Idempotentlik** — `(channelId, externalOrderId)` bo'yicha: o'sha hodisa ikkinchi
 *      marta kelsa IKKINCHI hujjat tug'ilmaydi, mavjudi `duplicate: true` bilan qaytadi.
 *      Poyga (ikki so'rov bir vaqtda) `P2002` bilan tutiladi — 500 emas.
 *   3. **Tartib** — avval autentifikatsiya (imzo), keyin avtorizatsiya (kanal arxivmi).
 *      Teskarisi arxiv holatini imzosiz aniqlash imkonini berardi.
 *
 * Prisma qo'lda mock (telegram-webhook.auth.test.ts uslubi) — DB yo'q.
 */

const SECRET = 'chan-secret-0123456789abcdef';
const CHANNEL_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

function payload(externalOrderId = 'EXT-1'): string {
  return JSON.stringify({
    externalOrderId,
    customerName: 'Ali Valiyev',
    customerPhone: '+998901234567',
    sumMinor: '150000',
    currency: 'UZS',
    items: [{ name: 'kabel', qty: 2, price: 75000 }],
  });
}

interface ChannelFixture {
  archived?: boolean;
  /** `undefined` = kanal umuman yo'q · `null` = sir sozlanmagan */
  secret?: string | null;
  settings?: Record<string, unknown>;
}

function makeService(channel: ChannelFixture | undefined, existingOrder: unknown = null) {
  const channelRow =
    channel === undefined
      ? null
      : {
          id: CHANNEL_ID,
          accountId: ACCOUNT_ID,
          archived: channel.archived ?? false,
          settings: {
            ...(channel.settings ?? {}),
            ...(channel.secret === null || channel.secret === undefined
              ? {}
              : { inboundWebhookSecretCipher: encryptPassword(channel.secret) }),
          },
        };

  const channelFindUnique = vi.fn(async () => channelRow);
  const channelUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...channelRow,
    ...data,
  }));
  const orderFindUnique = vi.fn(async () => existingOrder);
  const orderCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: '33333333-3333-4333-8333-333333333333',
    state: 'pending',
    sumMinor: 150000n,
    ...data,
  }));

  const prisma = {
    client: {
      salesChannel: {
        findUnique: channelFindUnique,
        findFirst: channelFindUnique,
        update: channelUpdate,
      },
      onlineOrder: { findUnique: orderFindUnique, create: orderCreate },
    },
  };
  const service = new OnlineOrderService(prisma as never);
  return { service, channelFindUnique, channelUpdate, orderFindUnique, orderCreate };
}

describe('OnlineOrderService.ingestWebhook — imzo', () => {
  it("to'g'ri imzo → buyurtma yaratiladi (pending), duplicate:false", async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    const body = payload();

    const res = await service.ingestWebhook(CHANNEL_ID, body, sign(body));

    expect(res.duplicate).toBe(false);
    expect(orderCreate).toHaveBeenCalledTimes(1);
    const created = orderCreate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(created.channelId).toBe(CHANNEL_ID);
    expect(created.accountId).toBe(ACCOUNT_ID);
    expect(created.externalOrderId).toBe('EXT-1');
  });

  it("noto'g'ri imzo → 401 va HECH QANDAY yozuv yaratilmaydi", async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    const body = payload();

    await expect(
      service.ingestWebhook(CHANNEL_ID, body, sign(body, 'boshqa-sir')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('401 javobida sir ham, kutilgan imzo ham OSHKOR BO‘LMAYDI', async () => {
    const { service } = makeService({ secret: SECRET });
    const body = payload();
    const expected = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

    const err = await service.ingestWebhook(CHANNEL_ID, body, 'sha256=deadbeef').catch((e) => e);

    const text = `${(err as Error).message} ${JSON.stringify((err as UnauthorizedException).getResponse())}`;
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(expected);
  });

  it('LOG‘da sir ham, kutilgan imzo ham, tana matni ham YO‘Q', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const { service } = makeService({ secret: SECRET });
      const body = payload();
      const expected = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

      await service.ingestWebhook(CHANNEL_ID, body, 'sha256=deadbeef').catch(() => undefined);

      const logged = [...warn.mock.calls, ...error.mock.calls].map((c) => c.join(' ')).join('\n');
      expect(logged).not.toBe(''); // vakuum emas — rad etish HAQIQATAN log'lanadi
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain(expected);
      expect(logged).not.toContain('+998901234567');
      expect(logged).toContain(CHANNEL_ID); // tergov uchun kanal id qoladi
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('imzo sarlavhasi umuman yo‘q → 401 (fail-closed)', async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    await expect(service.ingestWebhook(CHANNEL_ID, payload(), undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('kanalda sir SOZLANMAGAN → to‘g‘ri imzo bilan ham 401 (fail-closed)', async () => {
    const { service, orderCreate } = makeService({ secret: null });
    const body = payload();
    await expect(service.ingestWebhook(CHANNEL_ID, body, sign(body))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('noma‘lum channelId → 401 (kanal mavjudligi oshkor qilinmaydi, enumeratsiya yo‘q)', async () => {
    const { service } = makeService(undefined);
    const body = payload();
    await expect(service.ingestWebhook(CHANNEL_ID, body, sign(body))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('imzo XOM tana ustidan — probel qo‘shilgan tana o‘z imzosi bilan o‘tadi', async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    const spaced = `{\n  "externalOrderId": "EXT-9",\n  "sumMinor": "1"\n}`;

    await service.ingestWebhook(CHANNEL_ID, spaced, sign(spaced));

    expect(orderCreate).toHaveBeenCalledTimes(1);
  });

  it('Buffer ko‘rinishidagi xom tana ham qabul qilinadi (Fastify rawBody = Buffer)', async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    const body = payload('EXT-BUF');

    await service.ingestWebhook(CHANNEL_ID, Buffer.from(body, 'utf8'), sign(body));

    expect(orderCreate).toHaveBeenCalledTimes(1);
  });
});

describe('OnlineOrderService.ingestWebhook — idempotentlik', () => {
  it('bir xil externalOrderId ikkinchi marta → IKKINCHI hujjat yaratilmaydi', async () => {
    const existing = {
      id: '44444444-4444-4444-8444-444444444444',
      state: 'accepted',
      externalOrderId: 'EXT-1',
      sumMinor: 150000n,
    };
    const { service, orderCreate } = makeService({ secret: SECRET }, existing);
    const body = payload();

    const res = await service.ingestWebhook(CHANNEL_ID, body, sign(body));

    expect(res.duplicate).toBe(true);
    expect(res.id).toBe(existing.id);
    expect(res.state).toBe('accepted');
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('POYGA: findUnique bo‘sh, create P2002 → 500 emas, mavjudi qaytariladi', async () => {
    const existing = { id: '55555555-5555-4555-8555-555555555555', state: 'pending', sumMinor: 1n };
    const { service, orderCreate, orderFindUnique } = makeService({ secret: SECRET });
    orderFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existing as never);
    orderCreate.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    const body = payload();

    const res = await service.ingestWebhook(CHANNEL_ID, body, sign(body));

    expect(res.duplicate).toBe(true);
    expect(res.id).toBe(existing.id);
  });
});

describe('OnlineOrderService.ingestWebhook — avtorizatsiya va payload', () => {
  it('arxivlangan kanal → imzo to‘g‘ri bo‘lsa ham 403 (avval autentifikatsiya, keyin avtorizatsiya)', async () => {
    const { service, orderCreate } = makeService({ secret: SECRET, archived: true });
    const body = payload();

    await expect(service.ingestWebhook(CHANNEL_ID, body, sign(body))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('arxiv holati IMZOSIZ aniqlanmaydi — imzo noto‘g‘ri bo‘lsa 403 emas, 401', async () => {
    const { service } = makeService({ secret: SECRET, archived: true });
    const body = payload();

    const err = await service.ingestWebhook(CHANNEL_ID, body, 'sha256=deadbeef').catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
  });

  it('yaroqsiz payload (externalOrderId yo‘q) → yozuv yaratilmaydi', async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    const body = JSON.stringify({ customerName: 'kimdir' });

    await expect(service.ingestWebhook(CHANNEL_ID, body, sign(body))).rejects.toThrow();
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('JSON emas tana → yozuv yaratilmaydi (imzo to‘g‘ri bo‘lsa ham)', async () => {
    const { service, orderCreate } = makeService({ secret: SECRET });
    const body = 'not-json-at-all';

    await expect(service.ingestWebhook(CHANNEL_ID, body, sign(body))).rejects.toThrow();
    expect(orderCreate).not.toHaveBeenCalled();
  });
});

describe('OnlineOrderService.rotateWebhookSecret', () => {
  it('ochiq matn BIR MARTA qaytadi, bazaga faqat shifrlangan holda yoziladi', async () => {
    const { service, channelUpdate } = makeService({ secret: null });

    const res = await service.rotateWebhookSecret(ACCOUNT_ID, CHANNEL_ID);

    expect(res.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headerName).toBe(INBOUND_SIGNATURE_HEADER);
    const written = channelUpdate.mock.calls[0]?.[0].data as {
      settings: Record<string, unknown>;
    };
    expect(JSON.stringify(written.settings)).not.toContain(res.secret);
    expect(written.settings.inboundWebhookSecretCipher).toEqual(expect.any(String));
  });

  it('PATCH-semantika: kanalning boshqa settings kalitlari SAQLANADI (INT-13 sabog‘i)', async () => {
    const { service, channelUpdate } = makeService({
      secret: null,
      settings: { shopUrl: 'https://do.kon', apiVersion: 2 },
    });

    await service.rotateWebhookSecret(ACCOUNT_ID, CHANNEL_ID);

    const written = channelUpdate.mock.calls[0]?.[0].data as {
      settings: Record<string, unknown>;
    };
    expect(written.settings.shopUrl).toBe('https://do.kon');
    expect(written.settings.apiVersion).toBe(2);
  });

  it('yangi sir bilan imzolangan so‘rov o‘tadi (rotatsiya haqiqatda ishlaydi)', async () => {
    const { service, channelUpdate } = makeService({ secret: null });
    const { secret } = await service.rotateWebhookSecret(ACCOUNT_ID, CHANNEL_ID);
    const cipher = (
      channelUpdate.mock.calls[0]?.[0].data as { settings: { inboundWebhookSecretCipher: string } }
    ).settings.inboundWebhookSecretCipher;

    const rotated = makeService({ secret: null });
    rotated.channelFindUnique.mockResolvedValue({
      id: CHANNEL_ID,
      accountId: ACCOUNT_ID,
      archived: false,
      settings: { inboundWebhookSecretCipher: cipher },
    } as never);
    const body = payload('EXT-ROT');

    await rotated.service.ingestWebhook(CHANNEL_ID, body, sign(body, secret));

    expect(rotated.orderCreate).toHaveBeenCalledTimes(1);
  });
});

describe('OnlineOrderWebhookController', () => {
  it('xom tanani va imzo sarlavhasini servisga UZATADI', async () => {
    const ingestWebhook = vi.fn(async () => ({
      ok: true as const,
      duplicate: false,
      id: 'x',
      state: 'pending',
    }));
    const ctl = new OnlineOrderWebhookController({ ingestWebhook } as never);
    const raw = Buffer.from(payload(), 'utf8');

    await ctl.receive(CHANNEL_ID, 'sha256=abc', { rawBody: raw } as never);

    expect(ingestWebhook).toHaveBeenCalledWith(CHANNEL_ID, raw, 'sha256=abc');
  });

  it('rawBody yo‘q bo‘lsa ham servisga uzatiladi — u yerda fail-closed rad etiladi', async () => {
    const ingestWebhook = vi.fn(async () => {
      throw new UnauthorizedException('Invalid signature');
    });
    const ctl = new OnlineOrderWebhookController({ ingestWebhook } as never);

    await expect(ctl.receive(CHANNEL_ID, 'sha256=abc', {} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(ingestWebhook).toHaveBeenCalledWith(CHANNEL_ID, undefined, 'sha256=abc');
  });
});
