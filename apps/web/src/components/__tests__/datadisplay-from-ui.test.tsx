import { renderWithProviders, screen } from '@/test-utils';
import { MoneyProgress, StatCard } from '@moysklad/ui';
/**
 * Data-display primitives (from @moysklad/ui) tests — StatCard +
 * MoneyProgress.
 *
 * StatCard: KPI card used across dashboards (count + delta hint).
 * MoneyProgress: money cell with thin progress bar — every money
 * column in the customer-orders list uses this. Bar is computed
 * from value/total ratio (BigInt-safe).
 */
import { describe, expect, it } from 'vitest';

describe('StatCard', () => {
  describe('basic rendering', () => {
    it('renders the label uppercased + muted', () => {
      renderWithProviders(<StatCard label="Sotuvlar" value="123" />);
      const lbl = screen.getByText('Sotuvlar');
      expect(lbl.tagName).toBe('P');
      expect(lbl.className).toContain('uppercase');
      expect(lbl.className).toContain('text-[var(--ms-text-muted)]');
    });

    it('renders the value as a 2xl bold number', () => {
      renderWithProviders(<StatCard label="x" value="1,234" />);
      const v = screen.getByText('1,234');
      expect(v.className).toContain('text-2xl');
      expect(v.className).toContain('font-semibold');
      expect(v.className).toContain('tabular-nums');
    });

    it('does NOT render hint by default', () => {
      renderWithProviders(<StatCard label="x" value="1" />);
      expect(screen.queryByText('+12%')).toBeNull();
    });

    it('renders hint as muted-xs when provided', () => {
      renderWithProviders(<StatCard label="x" value="1" hint="+12%" />);
      const hint = screen.getByText('+12%');
      expect(hint.className).toContain('text-xs');
      expect(hint.className).toContain('text-[var(--ms-text-muted)]');
    });

    it('uses card chrome (rounded + border + bg-surface + p-4)', () => {
      const { container } = renderWithProviders(<StatCard label="x" value="1" />);
      const card = container.querySelector('div');
      expect(card?.className).toContain('rounded-[var(--ms-radius-md)]');
      expect(card?.className).toContain('border-[var(--ms-border-default)]');
      expect(card?.className).toContain('bg-[var(--ms-bg-surface)]');
      expect(card?.className).toContain('p-4');
    });
  });

  describe('tone variants', () => {
    it('neutral (default) → no tone class on value', () => {
      renderWithProviders(<StatCard label="x" value="V" />);
      const v = screen.getByText('V');
      expect(v.className).not.toContain('text-[var(--ms-text-success)]');
      expect(v.className).not.toContain('text-[var(--ms-text-warning)]');
      expect(v.className).not.toContain('text-[var(--ms-text-destructive)]');
    });

    it('success → green text on value', () => {
      renderWithProviders(<StatCard label="x" value="V" tone="success" />);
      expect(screen.getByText('V').className).toContain('text-[var(--ms-text-success)]');
    });

    it('warning → orange text on value', () => {
      renderWithProviders(<StatCard label="x" value="V" tone="warning" />);
      expect(screen.getByText('V').className).toContain('text-[var(--ms-text-warning)]');
    });

    it('destructive → red text on value', () => {
      renderWithProviders(<StatCard label="x" value="V" tone="destructive" />);
      expect(screen.getByText('V').className).toContain('text-[var(--ms-text-destructive)]');
    });
  });

  describe('forwarded ref + className merge', () => {
    it('forwards ref to the outer div', () => {
      let captured: HTMLDivElement | null = null;
      renderWithProviders(
        <StatCard
          label="x"
          value="1"
          ref={(el) => {
            captured = el;
          }}
        />,
      );
      expect(captured).toBeInstanceOf(HTMLDivElement);
    });

    it('merges user className', () => {
      const { container } = renderWithProviders(
        <StatCard label="x" value="1" className="my-extra" />,
      );
      const div = container.querySelector('div');
      expect(div?.className).toContain('my-extra');
      expect(div?.className).toContain('p-4');
    });
  });
});

describe('MoneyProgress', () => {
  describe('value rendering', () => {
    it('renders the formatted money amount (UZS, no currency symbol)', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="500000" totalMinor="1000000" />,
      );
      // formatMoney with displayAs:'none' → digits only (e.g. "5 000")
      const text = container.textContent ?? '';
      expect(text).toMatch(/5[\s,.]?000/);
    });

    it('uses tabular-nums + font-medium on the amount span', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="100000" totalMinor="100000" />,
      );
      const amount = container.querySelector('span');
      expect(amount?.className).toContain('tabular-nums');
      expect(amount?.className).toContain('font-medium');
    });
  });

  describe('alignment', () => {
    it('right-aligns by default (items-end)', () => {
      const { container } = renderWithProviders(<MoneyProgress valueMinor="1" totalMinor="1" />);
      const wrapper = container.querySelector('div');
      expect(wrapper?.className).toContain('items-end');
    });

    it('align=left → items-start', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="1" totalMinor="1" align="left" />,
      );
      const wrapper = container.querySelector('div');
      expect(wrapper?.className).toContain('items-start');
    });
  });

  describe('progress bar visibility', () => {
    it('does NOT render bar when value=0', () => {
      const { container } = renderWithProviders(<MoneyProgress valueMinor="0" totalMinor="1000" />);
      // No bar span (h-[2px] track)
      expect(container.querySelector('span.h-\\[2px\\]')).toBeNull();
    });

    it('does NOT render bar when total=0', () => {
      const { container } = renderWithProviders(<MoneyProgress valueMinor="500" totalMinor="0" />);
      expect(container.querySelector('span.h-\\[2px\\]')).toBeNull();
    });

    it('renders bar when both value > 0 AND total > 0', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="500" totalMinor="1000" />,
      );
      expect(container.querySelector('span.h-\\[2px\\]')).toBeInTheDocument();
    });
  });

  describe('bar width calculation', () => {
    it('value=total → 100% width', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="1000" totalMinor="1000" />,
      );
      const fill = container.querySelector('span[style*="width"]') as HTMLElement;
      expect(fill.style.width).toBe('100.0%');
    });

    it('value=0 means no bar (already covered above)', () => {
      // sanity check
      const { container } = renderWithProviders(<MoneyProgress valueMinor="0" totalMinor="1000" />);
      expect(container.querySelector('span[style*="width"]')).toBeNull();
    });

    it('value=500/total=1000 → 50.0% width', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="500" totalMinor="1000" />,
      );
      const fill = container.querySelector('span[style*="width"]') as HTMLElement;
      expect(fill.style.width).toBe('50.0%');
    });

    it('value=750/total=1000 → 75.0% width', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="750" totalMinor="1000" />,
      );
      const fill = container.querySelector('span[style*="width"]') as HTMLElement;
      expect(fill.style.width).toBe('75.0%');
    });

    it('value > total clamps to 100%', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="2000" totalMinor="1000" />,
      );
      const fill = container.querySelector('span[style*="width"]') as HTMLElement;
      expect(fill.style.width).toBe('100.0%');
    });
  });

  describe('auto-tone (computed)', () => {
    it('value=total → success tone (green bar)', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="1000" totalMinor="1000" />,
      );
      const fill = container.querySelector('span[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-text-success)]');
    });

    it('value < total → warning tone (orange bar)', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="500" totalMinor="1000" />,
      );
      const fill = container.querySelector('span[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-text-warning)]');
    });
  });

  describe('explicit tone override', () => {
    it('tone="destructive" → red bar even if value=total', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="1000" totalMinor="1000" tone="destructive" />,
      );
      const fill = container.querySelector('span[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-text-destructive)]');
    });

    it('tone="neutral" → border-default colored bar', () => {
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor="500" totalMinor="1000" tone="neutral" />,
      );
      const fill = container.querySelector('span[style*="width"]');
      expect(fill?.className).toContain('bg-[var(--ms-border-default)]');
    });
  });

  describe('BigInt safety', () => {
    it('handles huge values (way beyond Number.MAX_SAFE_INTEGER)', () => {
      // Total over 1e16 (beyond Number safe range), value 50%
      const huge = '99999999999999999';
      const half = '49999999999999999';
      const { container } = renderWithProviders(
        <MoneyProgress valueMinor={half} totalMinor={huge} />,
      );
      const fill = container.querySelector('span[style*="width"]') as HTMLElement;
      // 49999999.../99999999... = ~0.5 → 50.0%
      expect(fill.style.width).toMatch(/^49\.\d|50\.0%/);
    });

    // Note: `valueMinor: string` type contract requires a valid BigInt-
    // string. The internal safeBigInt() guards the bar computation, but
    // formatMoney itself would still crash on garbage. Testing that
    // boundary would require either a relaxed contract or a wrapper —
    // for now we trust the type system.
  });
});
