import { describe, expect, it } from 'vitest';
import {
  type NotificationRenderContext,
  buildSupplyReceipt,
  formatMinor,
  renderNotificationTemplate,
} from './template-render.util.js';

describe('renderNotificationTemplate', () => {
  it('interpolates simple top-level field via {{= … }} syntax', () => {
    const out = renderNotificationTemplate('Hi {{= counterparty.name }}!', {
      counterparty: { name: 'Anvar' },
    });
    expect(out).toBe('Hi Anvar!');
  });

  it('renders a multi-field template (demand.posted default-shape)', () => {
    const out = renderNotificationTemplate(
      "Hurmatli {{= counterparty.name }}, sizga {{= demand.totalFormatted }} so'mlik tovar berildi.",
      {
        counterparty: { name: 'OOO Test' },
        demand: { totalFormatted: '1 234 500' },
      },
    );
    expect(out).toBe("Hurmatli OOO Test, sizga 1 234 500 so'mlik tovar berildi.");
  });

  it('renders multi-line templates (newlines preserved)', () => {
    const out = renderNotificationTemplate(
      'Line A {{= counterparty.name }}\nLine B {{= balance.formatted }}',
      {
        counterparty: { name: 'X' },
        balance: { formatted: '500' },
      },
    );
    expect(out).toBe('Line A X\nLine B 500');
  });

  it('does NOT HTML-escape (Telegram is plain text)', () => {
    const out = renderNotificationTemplate('\'a\' & "b" <c>', {
      counterparty: { name: '' },
    });
    // No template tokens — just verify special chars survive
    expect(out).toBe('\'a\' & "b" <c>');
  });

  it("preserves Uzbek apostrophes (so'm, bo'lim, …) — no autoEscape", () => {
    const out = renderNotificationTemplate("{{= counterparty.name }} so'm to'lov", {
      counterparty: { name: 'Ali' },
    });
    expect(out).toBe("Ali so'm to'lov");
  });

  it('throws on syntax error (caller must catch + log)', () => {
    expect(() =>
      renderNotificationTemplate('{{= broken syntax', {
        counterparty: { name: 'X' },
      }),
    ).toThrow();
  });

  it('renders only the fields actually referenced (no payment ⇒ no payment in template)', () => {
    // Authors should write templates that reference only the keys present
    // for their event. The renderer does NOT silently swallow missing-key
    // access (useWith uses JS `with`, which throws ReferenceError).
    expect(() =>
      renderNotificationTemplate(
        'Hi {{= counterparty.name }}, payment={{= payment.sumFormatted }}',
        { counterparty: { name: 'Anvar' } },
      ),
    ).toThrow();
  });
});

describe('formatMinor', () => {
  it('returns "—" for null / undefined', () => {
    expect(formatMinor(null)).toBe('—');
    expect(formatMinor(undefined)).toBe('—');
  });

  it('returns "0" for 0', () => {
    expect(formatMinor(0n)).toBe('0');
    expect(formatMinor(0)).toBe('0');
  });

  it('divides minor → som (truncates tiyin)', () => {
    // 100 tiyin = 1 so'm
    expect(formatMinor(100n)).toBe('1');
    // 12_345_67 tiyin = 12 345 so'm (67 tiyin dropped)
    expect(formatMinor(1_234_567n)).toBe('12 345');
  });

  it('groups thousands with thin space separators', () => {
    expect(formatMinor(100_000_000n)).toBe('1 000 000');
    expect(formatMinor(1_234_500_000_000n)).toBe('12 345 000 000');
  });

  it('handles negative amounts', () => {
    expect(formatMinor(-1_234_500n)).toBe('-12 345');
  });

  it('accepts string input (Prisma BigInt → JSON string round-trip)', () => {
    expect(formatMinor('1234500')).toBe('12 345');
  });

  it('accepts number input', () => {
    expect(formatMinor(123_456)).toBe('1 234');
  });

  it('returns "—" for unparseable input (no throw)', () => {
    expect(formatMinor('not-a-number')).toBe('—');
  });
});

describe('buildSupplyReceipt', () => {
  const baseCtx = (): NotificationRenderContext => ({
    counterparty: { name: 'OOO Ta’minot' },
    supply: {
      number: '00772',
      totalFormatted: '3 150 000',
      dateFormatted: '19.07.2026',
      items: [
        {
          name: 'Sement M400',
          quantity: '50',
          uom: 'шт',
          priceFormatted: '45 000',
          sumFormatted: '2 250 000',
        },
        {
          name: "G'isht",
          quantity: '1000',
          uom: 'шт',
          priceFormatted: '900',
          sumFormatted: '900 000',
        },
      ],
    },
  });

  it('renders a full itemized receipt (header, lines, footer)', () => {
    const out = buildSupplyReceipt(baseCtx());
    expect(out).toContain('🧾 QABUL CHEKI');
    expect(out).toContain('Hujjat: № 00772');
    expect(out).toContain('Sana: 19.07.2026');
    expect(out).toContain('Yetkazib beruvchi: OOO Ta’minot');
    expect(out).toContain("1. Sement M400\n   50 шт × 45 000 = 2 250 000 so'm");
    expect(out).toContain("2. G'isht\n   1000 шт × 900 = 900 000 so'm");
    expect(out).toContain("Jami: 3 150 000 so'm");
    expect(out).toContain('Hamkorligingiz uchun rahmat! 🤝');
  });

  it('omits the unit when uom is null', () => {
    const ctx = baseCtx();
    // biome-ignore lint/style/noNonNullAssertion: fixture always has items
    ctx.supply!.items![0]!.uom = null;
    const out = buildSupplyReceipt(ctx);
    expect(out).toContain("1. Sement M400\n   50 × 45 000 = 2 250 000 so'm");
  });

  it('drops optional header rows (number / date) when absent', () => {
    const ctx = baseCtx();
    // biome-ignore lint/style/noNonNullAssertion: fixture always has supply
    ctx.supply!.number = null;
    // biome-ignore lint/style/noNonNullAssertion: fixture always has supply
    ctx.supply!.dateFormatted = null;
    const out = buildSupplyReceipt(ctx);
    expect(out).not.toContain('Hujjat: №');
    expect(out).not.toContain('Sana:');
    expect(out).toContain('Yetkazib beruvchi: OOO Ta’minot');
  });

  it('returns "" when there are no items (dispatcher skips blank enqueue)', () => {
    expect(buildSupplyReceipt({ counterparty: { name: 'X' } })).toBe('');
    expect(
      buildSupplyReceipt({
        counterparty: { name: 'X' },
        supply: { totalFormatted: '0', items: [] },
      }),
    ).toBe('');
  });
});
