import { describe, expect, it, vi } from 'vitest';
import { MessageTemplateService } from './sms-template.service.js';

// $transaction — callback'ni bir xil client bilan chaqiradi (in-memory mock).
function makePrisma(rows: Record<string, unknown>[] = []) {
  const store = [...rows];
  const client = {
    messageTemplate: {
      findMany: vi.fn(async () => store),
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          store.find(
            (r) =>
              (r as { channel?: string }).channel === where.channel &&
              (r as { isDefault?: boolean }).isDefault === true &&
              (r as { enabled?: boolean }).enabled === true,
          ) ?? null,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          store.find((r) => (r as { id: string }).id === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new',
        key: null,
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'x',
        channel: 'sms',
        key: null,
        name: 'n',
        body: 'b',
        enabled: true,
        isDefault: false,
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      delete: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return { client } as never;
}

describe('MessageTemplateService', () => {
  it("create — telegram: MarkdownV2 render-validatsiyadan o'tadi", async () => {
    const svc = new MessageTemplateService(makePrisma());
    const r = await svc.create('acc', {
      channel: 'telegram',
      name: 'Q',
      body: 'Salom {{= counterparty.name }}, *__{{= debt.remainingFormatted }}__*',
      enabled: true,
      isDefault: false,
    });
    expect(r.channel).toBe('telegram');
  });

  it("create — buzuq o'zgaruvchi rad etiladi (400)", async () => {
    const svc = new MessageTemplateService(makePrisma());
    await expect(
      svc.create('acc', {
        channel: 'sms',
        name: 'Q',
        body: '{{= custamer.name }}',
        enabled: true,
        isDefault: false,
      }),
    ).rejects.toThrow();
  });

  it("create — isDefault=true bo'lsa eski defaultни tozalaydi (clearDefault)", async () => {
    const prisma = makePrisma();
    const svc = new MessageTemplateService(prisma);
    await svc.create('acc', {
      channel: 'telegram',
      name: 'D',
      body: 'ok {{= counterparty.name }}',
      enabled: true,
      isDefault: true,
    });
    // biome-ignore lint/suspicious/noExplicitAny: test mock introspection
    expect((prisma as any).client.messageTemplate.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc', channel: 'telegram', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('findDefault — kanalning default+enabled shablonini qaytaradi', async () => {
    const svc = new MessageTemplateService(
      makePrisma([
        {
          id: '1',
          accountId: 'acc',
          channel: 'telegram',
          name: 'D',
          body: 'B',
          enabled: true,
          isDefault: true,
          key: null,
        },
      ]),
    );
    const r = await svc.findDefault('acc', 'telegram');
    expect(r?.id).toBe('1');
  });

  it("findDefault — default yo'q → null", async () => {
    const svc = new MessageTemplateService(makePrisma([]));
    expect(await svc.findDefault('acc', 'sms')).toBeNull();
  });

  it('findOne — boshqa tenant → 404', async () => {
    const svc = new MessageTemplateService(
      makePrisma([
        {
          id: '1',
          accountId: 'OTHER',
          channel: 'sms',
          name: 'x',
          body: 'b',
          enabled: true,
          isDefault: false,
          key: null,
        },
      ]),
    );
    await expect(svc.findOne('acc', '1')).rejects.toThrow();
  });
});
