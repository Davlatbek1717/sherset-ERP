import { describe, expect, it, vi } from 'vitest';
import { SmsTemplateService } from './sms-template.service.js';

function makePrisma(rows: Record<string, unknown>[] = []) {
  return {
    client: {
      smsTemplate: {
        findMany: vi.fn().mockResolvedValue(rows),
        findUnique: vi.fn().mockResolvedValue(rows[0] ?? null),
        upsert: vi
          .fn()
          .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
            Promise.resolve({ id: 'x', ...create }),
          ),
      },
    },
  } as never;
}

describe('SmsTemplateService', () => {
  it('findByKey — mavjud shablon qaytaradi', async () => {
    const svc = new SmsTemplateService(
      makePrisma([{ id: '1', key: 'debt_reminder', name: 'Q', body: 'B', enabled: true }]),
    );
    const r = await svc.findByKey('acc', 'debt_reminder');
    expect(r?.key).toBe('debt_reminder');
  });

  it("upsert — validatsiyadan o'tgan bodyni yozadi", async () => {
    const svc = new SmsTemplateService(makePrisma());
    const r = await svc.upsert('acc', 'debt_reminder', {
      name: 'Qarz',
      body: 'Salom {{= counterparty.name }}',
      enabled: true,
    });
    expect(r.body).toContain('counterparty.name');
  });

  it("upsert — bo'sh body rad etiladi", async () => {
    const svc = new SmsTemplateService(makePrisma());
    await expect(
      svc.upsert('acc', 'debt_reminder', { name: 'Q', body: '', enabled: true }),
    ).rejects.toThrow();
  });

  it("upsert — noto'g'ri o'zgaruvchili shablon rad etiladi (test-render)", async () => {
    const svc = new SmsTemplateService(makePrisma());
    await expect(
      svc.upsert('acc', 'debt_reminder', {
        name: 'Q',
        body: 'Salom {{= custamer.name }}', // typo: custamer (yo'q o'zgaruvchi)
        enabled: true,
      }),
    ).rejects.toThrow();
  });

  it("upsert — to'g'ri o'zgaruvchili shablon saqlanadi", async () => {
    const svc = new SmsTemplateService(makePrisma());
    const r = await svc.upsert('acc', 'debt_reminder', {
      name: 'Q',
      body: 'Salom {{= counterparty.name }}, {{= debt.remainingFormatted }}',
      enabled: true,
    });
    expect(r.body).toContain('counterparty.name');
  });
});
