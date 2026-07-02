import { describe, expect, it } from 'vitest';
import { ListEmailLogsSchema, SaveEmailConfigSchema, SendEmailSchema } from './email.schema.js';

const uuid = () => crypto.randomUUID();

describe('SaveEmailConfigSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = SaveEmailConfigSchema.safeParse({
      fromEmail: 'noreply@company.uz',
      host: 'smtp.gmail.com',
      username: 'user@company.uz',
      password: 'app-password',
    });
    if (!r.success) throw r.error;
    expect(r.data.provider).toBe('custom');
    expect(r.data.port).toBe(587);
    expect(r.data.secure).toBe(false);
  });

  it('coerces port from string', () => {
    const r = SaveEmailConfigSchema.safeParse({
      fromEmail: 'a@b.co',
      host: 'smtp',
      username: 'u',
      password: 'p',
      port: '465',
    });
    if (!r.success) throw r.error;
    expect(r.data.port).toBe(465);
  });

  it('coerces secure from string "true"', () => {
    const r = SaveEmailConfigSchema.safeParse({
      fromEmail: 'a@b.co',
      host: 'smtp',
      username: 'u',
      password: 'p',
      secure: 'true',
    });
    if (!r.success) throw r.error;
    expect(r.data.secure).toBe(true);
  });

  it('rejects invalid fromEmail', () => {
    expect(
      SaveEmailConfigSchema.safeParse({
        fromEmail: 'not-an-email',
        host: 'smtp',
        username: 'u',
        password: 'p',
      }).success,
    ).toBe(false);
  });

  it('rejects port out of range', () => {
    expect(
      SaveEmailConfigSchema.safeParse({
        fromEmail: 'a@b.co',
        host: 'smtp',
        username: 'u',
        password: 'p',
        port: 70000,
      }).success,
    ).toBe(false);
  });

  it('treats empty fromName as null', () => {
    const r = SaveEmailConfigSchema.safeParse({
      fromName: '',
      fromEmail: 'a@b.co',
      host: 'smtp',
      username: 'u',
      password: 'p',
    });
    if (!r.success) throw r.error;
    expect(r.data.fromName).toBeNull();
  });

  it('treats empty replyTo as null', () => {
    const r = SaveEmailConfigSchema.safeParse({
      fromEmail: 'a@b.co',
      host: 'smtp',
      username: 'u',
      password: 'p',
      replyTo: '',
    });
    if (!r.success) throw r.error;
    expect(r.data.replyTo).toBeNull();
  });

  it('rejects non-email replyTo', () => {
    expect(
      SaveEmailConfigSchema.safeParse({
        fromEmail: 'a@b.co',
        host: 'smtp',
        username: 'u',
        password: 'p',
        replyTo: 'not-an-email',
      }).success,
    ).toBe(false);
  });

  it('omits password on update (allows keeping existing)', () => {
    const r = SaveEmailConfigSchema.safeParse({
      fromEmail: 'a@b.co',
      host: 'smtp',
      username: 'u',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown provider', () => {
    expect(
      SaveEmailConfigSchema.safeParse({
        provider: 'aol',
        fromEmail: 'a@b.co',
        host: 'smtp',
        username: 'u',
        password: 'p',
      }).success,
    ).toBe(false);
  });
});

describe('SendEmailSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = SendEmailSchema.safeParse({
      to: ['client@company.uz'],
      subject: 'Hello',
      bodyHtml: '<p>Hi</p>',
    });
    if (!r.success) throw r.error;
    expect(r.data.cc).toEqual([]);
    expect(r.data.attachmentIds).toEqual([]);
  });

  it('rejects empty to-list', () => {
    expect(
      SendEmailSchema.safeParse({
        to: [],
        subject: 'X',
        bodyHtml: 'X',
      }).success,
    ).toBe(false);
  });

  it('rejects > 20 recipients', () => {
    expect(
      SendEmailSchema.safeParse({
        to: Array.from({ length: 21 }, (_, i) => `u${i}@b.c`),
        subject: 'X',
        bodyHtml: 'X',
      }).success,
    ).toBe(false);
  });

  it('rejects non-email in to-list', () => {
    expect(
      SendEmailSchema.safeParse({
        to: ['valid@a.b', 'not-an-email'],
        subject: 'X',
        bodyHtml: 'X',
      }).success,
    ).toBe(false);
  });

  it('rejects empty subject', () => {
    expect(
      SendEmailSchema.safeParse({
        to: ['a@b.co'],
        subject: '',
        bodyHtml: 'X',
      }).success,
    ).toBe(false);
  });

  it('rejects 501-char subject', () => {
    expect(
      SendEmailSchema.safeParse({
        to: ['a@b.co'],
        subject: 'a'.repeat(501),
        bodyHtml: 'X',
      }).success,
    ).toBe(false);
  });

  it('accepts entity context', () => {
    const r = SendEmailSchema.safeParse({
      entity: 'InvoiceOut',
      entityId: uuid(),
      to: ['a@b.co'],
      subject: 'X',
      bodyHtml: '<p>X</p>',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown entity', () => {
    expect(
      SendEmailSchema.safeParse({
        entity: 'UnknownThing',
        entityId: uuid(),
        to: ['a@b.co'],
        subject: 'X',
        bodyHtml: 'X',
      }).success,
    ).toBe(false);
  });

  it('rejects > 10 attachments', () => {
    expect(
      SendEmailSchema.safeParse({
        to: ['a@b.co'],
        subject: 'X',
        bodyHtml: 'X',
        attachmentIds: Array.from({ length: 11 }, () => uuid()),
      }).success,
    ).toBe(false);
  });
});

describe('ListEmailLogsSchema', () => {
  it('defaults limit to 50', () => {
    const r = ListEmailLogsSchema.safeParse({});
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(50);
  });

  it('coerces limit from string', () => {
    const r = ListEmailLogsSchema.safeParse({ limit: '20' });
    if (!r.success) throw r.error;
    expect(r.data.limit).toBe(20);
  });

  it('rejects limit above max (500)', () => {
    expect(ListEmailLogsSchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it.each(['pending', 'sent', 'dead', 'failed'])('accepts %s status filter', (s) => {
    const r = ListEmailLogsSchema.safeParse({ status: s });
    if (!r.success) throw r.error;
    expect(r.data.status).toBe(s);
  });

  it('rejects unknown status filter', () => {
    expect(ListEmailLogsSchema.safeParse({ status: 'queued' }).success).toBe(false);
  });
});
