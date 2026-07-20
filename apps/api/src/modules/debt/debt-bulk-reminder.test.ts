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
  opts: {
    smsEnabled?: boolean;
    smsDefault?: unknown;
    tgDefault?: unknown;
    tgSent?: boolean;
  } = {},
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
  // findDefault kanalning enabled+default shabloni yoki null qaytaradi (real xulq).
  const smsTpl =
    opts.smsDefault === undefined
      ? {
          id: 't1',
          channel: 'sms',
          key: 'debt_reminder',
          name: 'Q',
          body: 'Qarz {{= debt.remainingFormatted }}',
          enabled: true,
          isDefault: true,
        }
      : opts.smsDefault;
  const tgTpl =
    opts.tgDefault === undefined
      ? {
          id: 'tg1',
          channel: 'telegram',
          key: 'debt_reminder',
          name: 'D',
          body: 'Qarz {{= debt.remainingFormatted }} som',
          enabled: true,
          isDefault: true,
        }
      : opts.tgDefault;
  const msgTemplates = {
    findDefault: vi.fn(async (_acc: string, channel: string) =>
      channel === 'telegram' ? tgTpl : smsTpl,
    ),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const telegram = { notifyCounterparty: vi.fn().mockResolvedValue({ sent: opts.tgSent ?? true }) };
  // Konstruktor tartibi: prisma, attachments, htmlPdf, balances, telegram, sms, msgTemplates.
  const svc = new DebtService(
    prisma,
    undefined as never,
    undefined as never,
    undefined as never,
    telegram as never,
    sms as never,
    msgTemplates as never,
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

  it("SMS — default shablon yo'q/o'chirilgan: template_disabled", async () => {
    // findDefault enabled+default'ni qidiradi — yo'q bo'lsa null → template_disabled.
    const { svc } = makeDeps([debtRow()], { smsDefault: null });
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

  it('Telegram — default shablon RENDER qilinadi (rendered matn yuboriladi)', async () => {
    const { svc, telegram } = makeDeps([debtRow()]); // remaining = 200000000 minor = 2 000 000
    await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'telegram' });
    const text = (telegram.notifyCounterparty as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(text).toBe('Qarz 2 000 000 som'); // 'Qarz {{= debt.remainingFormatted }} som'
  });

  it("Telegram — default shablon yo'q: FALLBACK (hardcoded reminderMessage)", async () => {
    const { svc, telegram } = makeDeps([debtRow()], { tgDefault: null });
    await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'telegram' });
    const text = (telegram.notifyCounterparty as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(text).toContain('Assalomu alaykum'); // fallback matn
    expect(text).toContain('SHERSET jamoasi!');
  });

  it("SMS — sms.send yiqilsa: send_error skip, partiya to'xtamaydi", async () => {
    const idA = '11111111-1111-1111-1111-111111111111';
    const idB = '22222222-2222-2222-2222-222222222222';
    const { svc, sms } = makeDeps([
      debtRow({ id: idA }),
      debtRow({ id: idB, counterparty: { name: 'Bek', phone: '+998907654321' } }),
    ]);
    // Birinchi qarzdorda send yiqiladi, ikkinchisi muvaffaqiyatli.
    (sms.send as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('body too long'))
      .mockResolvedValueOnce({ id: 'log2', status: 'pending' });
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [idA, idB], channel: 'sms' });
    expect(r.queued).toBe(1);
    expect(r.skipped.find((s) => s.id === idA)?.reason).toBe('send_error');
  });

  it("Telegram — notifyCounterparty reason o'z-o'zicha uzatiladi", async () => {
    const { svc, telegram } = makeDeps([debtRow()]);
    (telegram.notifyCounterparty as ReturnType<typeof vi.fn>).mockResolvedValue({
      sent: false,
      reason: 'telegram_off',
    });
    const r = await svc.sendBulkReminders('acc', 'u1', { ids: [DEBT_ID], channel: 'telegram' });
    expect(r.skipped[0]?.reason).toBe('telegram_off');
  });
});
