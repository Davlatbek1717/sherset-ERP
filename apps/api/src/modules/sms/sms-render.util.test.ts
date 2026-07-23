import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSAGING_CONTACT, formatSomMinor, renderSmsTemplate } from './sms-render.util.js';

describe('formatSomMinor', () => {
  it("tiyinni so'mga o'giradi va uch xonalab guruhlaydi", () => {
    expect(formatSomMinor(125000000n)).toBe('1 250 000');
    expect(formatSomMinor('100')).toBe('1');
    expect(formatSomMinor(0n)).toBe('0');
    expect(formatSomMinor(null)).toBe('—');
    expect(formatSomMinor(undefined)).toBe('—');
  });
});

describe('renderSmsTemplate', () => {
  const ctx = {
    counterparty: { name: 'Akmal aka' },
    debt: { remainingFormatted: '1 250 000', totalFormatted: '2 000 000' },
    company: { phone: '+998900000000', card: '0000', cardOwner: 'Egasi' },
  };
  it("o'zgaruvchilarni almashtiradi", () => {
    const out = renderSmsTemplate(
      'Salom {{= counterparty.name }}, qarz {{= debt.remainingFormatted }} som. Karta {{= company.card }}.',
      ctx,
    );
    expect(out).toBe('Salom Akmal aka, qarz 1 250 000 som. Karta 0000.');
  });
  it("DEFAULT_MESSAGING_CONTACT to'liq", () => {
    expect(DEFAULT_MESSAGING_CONTACT.phone).toMatch(/^\+998/);
    expect(DEFAULT_MESSAGING_CONTACT.card.length).toBeGreaterThan(0);
    expect(DEFAULT_MESSAGING_CONTACT.cardOwner.length).toBeGreaterThan(0);
  });
});
