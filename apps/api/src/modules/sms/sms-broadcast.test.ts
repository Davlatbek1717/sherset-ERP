import { describe, expect, it, vi } from 'vitest';
import { SmsService } from './sms.service.js';

const TPL = '11111111-1111-1111-1111-111111111111';

function makeSvc(
  counterparties: Array<{ id: string; name: string; phone: string | null }>,
  opts: { enabled?: boolean; templateChannel?: string } = {},
) {
  const created: Array<{ toPhone: string; body: string }> = [];
  const prisma = {
    client: {
      smsConfig: {
        findUnique: vi.fn().mockResolvedValue(opts.enabled === false ? null : { enabled: true }),
      },
      companySettings: { findUnique: vi.fn().mockResolvedValue(null) },
      counterparty: { findMany: vi.fn().mockResolvedValue(counterparties) },
      smsLog: {
        create: vi
          .fn()
          .mockImplementation(({ data }: { data: { toPhone: string; body: string } }) => {
            created.push({ toPhone: data.toPhone, body: data.body });
            return Promise.resolve({ id: `log-${created.length}` });
          }),
      },
    },
  } as never;
  const templates = {
    findOne: vi.fn().mockResolvedValue({
      id: TPL,
      channel: opts.templateChannel ?? 'sms',
      name: 'Umumiy',
      body: 'Salom {{= counterparty.name }}',
      enabled: true,
      isDefault: false,
    }),
  } as never;
  return { svc: new SmsService(prisma, templates), created };
}

describe('SmsService.broadcast', () => {
  it("kontragent + qo'lda raqam ikkalasini navbatga qo'yadi", async () => {
    const { svc, created } = makeSvc([
      { id: '00000000-0000-0000-0000-0000000000c1', name: 'ABC', phone: '+998901112233' },
    ]);
    const r = await svc.broadcast('acc', 'u1', {
      templateId: TPL,
      counterpartyIds: ['00000000-0000-0000-0000-0000000000c1'],
      phones: ['+998907778899'],
    });
    expect(r.queued).toBe(2);
    expect(created.map((c) => c.toPhone).sort()).toEqual(['+998901112233', '+998907778899']);
    expect(created[0].body).toContain('ABC'); // kontragent nomi render bo'ldi
  });

  it("telefoni yo'q kontragent skip: no_phone", async () => {
    const { svc } = makeSvc([
      { id: '00000000-0000-0000-0000-0000000000c1', name: 'ABC', phone: null },
    ]);
    const r = await svc.broadcast('acc', 'u1', {
      templateId: TPL,
      counterpartyIds: ['00000000-0000-0000-0000-0000000000c1'],
      phones: [],
    });
    expect(r.queued).toBe(0);
    expect(r.skipped[0]?.reason).toBe('no_phone');
  });

  it('dublikat raqam bir marta yuboriladi', async () => {
    const { svc, created } = makeSvc([
      { id: '00000000-0000-0000-0000-0000000000c1', name: 'ABC', phone: '+998901112233' },
    ]);
    const r = await svc.broadcast('acc', 'u1', {
      templateId: TPL,
      counterpartyIds: ['00000000-0000-0000-0000-0000000000c1'],
      phones: ['+998 90 111 22 33'], // bo'shliqli bir xil raqam
    });
    expect(r.queued).toBe(1);
    expect(created).toHaveLength(1);
  });

  it("SMS bo'lmagan shablon rad etiladi", async () => {
    const { svc } = makeSvc(
      [{ id: '00000000-0000-0000-0000-0000000000c1', name: 'ABC', phone: '+998901112233' }],
      {
        templateChannel: 'telegram',
      },
    );
    await expect(
      svc.broadcast('acc', 'u1', {
        templateId: TPL,
        counterpartyIds: ['00000000-0000-0000-0000-0000000000c1'],
        phones: [],
      }),
    ).rejects.toThrow();
  });
});
