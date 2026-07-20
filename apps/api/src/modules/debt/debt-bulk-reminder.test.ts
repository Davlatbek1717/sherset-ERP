import { describe, expect, it, vi } from 'vitest';
import { DebtService } from './debt.service.js';

const DEBT_ID = '11111111-1111-1111-1111-111111111111';

const debtRow = (over: Record<string, unknown> = {}) => ({
  id: DEBT_ID,
  totalMinor: 200000000n,
  paidMinor: 0n,
  counterpartyId: 'c1',
  counterparty: { name: 'Akmal', phone: '+998901234567' },
  ...over,
});

function makeDeps(
  debts: Record<string, unknown>[],
  opts: { smsEnabled?: boolean; template?: unknown; tgSent?: boolean } = {},
) {
  const prisma = {
    client: { debt: { findMany: vi.fn().mockResolvedValue(debts) } },
  } as never;
  const sms = {
    getConfig: vi.fn().mockResolvedValue(opts.smsEnabled === false ? null : { enabled: true }),
    getContacts: vi
      .fn()
      .mockResolvedValue({ phone: '+998900000000', card: '0000', cardOwner: 'X' }),
    send: vi.fn().mockResolvedValue({ id: 'log1', status: 'pending' }),
  };
  const smsTemplates = {
    findByKey: vi
      .fn()
      .mockResolvedValue(
        opts.template === undefined
          ? {
              key: 'debt_reminder',
              name: 'Q',
              body: 'Qarz {{= debt.remainingFormatted }}',
              enabled: true,
            }
          : opts.template,
      ),
  };
  const telegram = { notifyCounterparty: vi.fn().mockResolvedValue({ sent: opts.tgSent ?? true }) };
  // Konstruktor tartibi: prisma, attachments, htmlPdf, balances, telegram, sms, smsTemplates.
  const svc = new DebtService(
    prisma,
    undefined as never,
    undefined as never,
    undefined as never,
    telegram as never,
    sms as never,
    smsTemplates as never,
  );
  return { svc, sms, telegram };
}

describe('sendBulkReminders', () => {
  it("SMS — telefon bor: navbatga qo'yiladi", async () => {
    const { svc, sms } = makeDeps([debtRow()]);
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'sms' });
    expect(r.queued).toBe(1);
    expect(sms.send).toHaveBeenCalledOnce();
  });

  it("SMS — telefon yo'q: no_phone skip", async () => {
    const { svc, sms } = makeDeps([debtRow({ counterparty: { name: 'Akmal', phone: null } })]);
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'sms' });
    expect(r.queued).toBe(0);
    expect(r.skipped[0]?.reason).toBe('no_phone');
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("SMS — config yo'q: sms_not_configured", async () => {
    const { svc } = makeDeps([debtRow()], { smsEnabled: false });
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'sms' });
    expect(r.queued).toBe(0);
    expect(r.skipped[0]?.reason).toBe('sms_not_configured');
  });

  it("SMS — shablon o'chirilgan: template_disabled", async () => {
    const { svc } = makeDeps([debtRow()], {
      template: { key: 'debt_reminder', name: 'Q', body: 'x', enabled: false },
    });
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'sms' });
    expect(r.skipped[0]?.reason).toBe('template_disabled');
  });

  it("Telegram — chat yo'q: no_telegram_chat", async () => {
    const { svc } = makeDeps([debtRow()], { tgSent: false });
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'telegram' });
    expect(r.queued).toBe(0);
    expect(r.skipped[0]?.reason).toBe('no_telegram_chat');
  });

  it('Telegram — yuborildi: queued', async () => {
    const { svc } = makeDeps([debtRow()], { tgSent: true });
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'telegram' });
    expect(r.queued).toBe(1);
  });
});
