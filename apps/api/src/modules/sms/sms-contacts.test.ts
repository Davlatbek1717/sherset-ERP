import { describe, expect, it, vi } from 'vitest';
import { SmsService } from './sms.service.js';

function prismaWith(settings: Record<string, unknown> | null) {
  return {
    client: {
      companySettings: {
        findUnique: vi.fn().mockResolvedValue(settings),
        upsert: vi
          .fn()
          .mockImplementation(
            ({
              create,
              update,
            }: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
              Promise.resolve({ ...create, ...update }),
          ),
      },
    },
  } as never;
}

describe('SmsService contacts', () => {
  it("getContacts — bo'sh maydon default bilan to'ladi", async () => {
    const svc = new SmsService(prismaWith(null));
    const c = await svc.getContacts('acc');
    expect(c.phone).toMatch(/^\+998/);
    expect(c.card.length).toBeGreaterThan(0);
    expect(c.cardOwner.length).toBeGreaterThan(0);
  });

  it('getContacts — saqlangan qiymat defaultni ustunlaydi', async () => {
    const svc = new SmsService(
      prismaWith({
        messagingPhone: '+998911111111',
        messagingCard: null,
        messagingCardOwner: null,
      }),
    );
    const c = await svc.getContacts('acc');
    expect(c.phone).toBe('+998911111111');
    // card bo'sh → default
    expect(c.card).not.toBe('');
  });

  it('getRawContacts — real (null) qiymatlar', async () => {
    const svc = new SmsService(prismaWith(null));
    const c = await svc.getRawContacts('acc');
    expect(c.phone).toBeNull();
  });
});
