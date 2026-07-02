import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { Select } from '@moysklad/ui';
/**
 * Select (from @moysklad/ui) tests — Radix-backed dropdown for ≤30
 * fixed options (currency, status, role). Larger lists go to Combobox.
 *
 * Tests guard the trigger rendering, controlled value, popover open
 * on click, item rendering inside the portal, item selection, the
 * disabled state, the invalid state, and the placeholder.
 *
 * Per-option `disabled` and `hint` slot are also exercised — they're
 * easy to break in a Radix wrapper refactor.
 */
import { describe, expect, it, vi } from 'vitest';

const OPTS = [
  { value: 'usd' as const, label: 'USD' },
  { value: 'eur' as const, label: 'EUR' },
  { value: 'uzs' as const, label: 'UZS' },
];

describe('Select', () => {
  describe('trigger rendering', () => {
    it('renders a trigger with role="combobox"', () => {
      renderWithProviders(
        <Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="Currency" />,
      );
      // Radix Select uses combobox role for the trigger
      expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument();
    });

    it('shows the selected label inside the trigger', () => {
      renderWithProviders(<Select value="eur" onChange={vi.fn()} options={OPTS} ariaLabel="x" />);
      expect(screen.getByRole('combobox', { name: 'x' }).textContent).toContain('EUR');
    });

    it('shows the placeholder when no value selected', () => {
      renderWithProviders(
        <Select
          value={undefined}
          onChange={vi.fn()}
          options={OPTS}
          ariaLabel="x"
          placeholder="Pick one..."
        />,
      );
      expect(screen.getByRole('combobox', { name: 'x' }).textContent).toContain('Pick one...');
    });
  });

  describe('open behavior', () => {
    it('clicking trigger opens the popper with all options', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Select value={undefined} onChange={vi.fn()} options={OPTS} ariaLabel="x" />,
      );
      await user.click(screen.getByRole('combobox', { name: 'x' }));
      await waitFor(() => {
        expect(screen.getByText('USD')).toBeInTheDocument();
        expect(screen.getByText('EUR')).toBeInTheDocument();
        expect(screen.getByText('UZS')).toBeInTheDocument();
      });
    });
  });

  describe('item selection', () => {
    it('clicking an item calls onChange with its value', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<Select value="usd" onChange={onChange} options={OPTS} ariaLabel="x" />);
      await user.click(screen.getByRole('combobox', { name: 'x' }));
      const eur = await screen.findByText('EUR');
      await user.click(eur);
      expect(onChange).toHaveBeenCalledWith('eur');
    });
  });

  describe('disabled state', () => {
    it('renders the trigger as disabled', () => {
      renderWithProviders(
        <Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="x" disabled />,
      );
      expect(screen.getByRole('combobox', { name: 'x' })).toBeDisabled();
    });

    it('clicking disabled trigger does NOT open the popper', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="x" disabled />,
      );
      await user.click(screen.getByRole('combobox', { name: 'x' }));
      // Popper items should NOT be in the DOM
      // (USD is in the trigger as the selected label, but EUR/UZS would only show in the popper)
      expect(screen.queryByText('EUR')).toBeNull();
    });
  });

  describe('invalid state', () => {
    it('sets aria-invalid="true" when invalid=true', () => {
      renderWithProviders(
        <Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="x" invalid />,
      );
      expect(screen.getByRole('combobox', { name: 'x' })).toHaveAttribute('aria-invalid', 'true');
    });

    it('uses destructive border color when invalid', () => {
      renderWithProviders(
        <Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="x" invalid />,
      );
      const trigger = screen.getByRole('combobox', { name: 'x' });
      expect(trigger.className).toContain('border-[var(--ms-action-destructive)]');
    });
  });

  describe('per-option disabled', () => {
    it('disabled options are NOT selectable', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Select
          value="usd"
          onChange={onChange}
          options={[
            { value: 'usd', label: 'USD' },
            { value: 'eur', label: 'EUR', disabled: true },
          ]}
          ariaLabel="x"
        />,
      );
      await user.click(screen.getByRole('combobox', { name: 'x' }));
      const eur = await screen.findByText('EUR');
      await user.click(eur);
      // Radix prevents selection of disabled items → onChange NOT called
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('per-option hint slot', () => {
    it('renders the hint to the right of the label', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Select
          value={undefined}
          onChange={vi.fn()}
          options={[{ value: 'usd', label: 'USD', hint: 'Dollar' }]}
          ariaLabel="x"
        />,
      );
      await user.click(screen.getByRole('combobox', { name: 'x' }));
      await waitFor(() => {
        expect(screen.getByText('Dollar')).toBeInTheDocument();
      });
    });
  });

  describe('layout baseline', () => {
    it('trigger has control-height token + border + NO radius (moysklad parity)', () => {
      renderWithProviders(<Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="x" />);
      const trigger = screen.getByRole('combobox', { name: 'x' });
      expect(trigger.className).toContain('h-[var(--ms-control-h)]');
      // user 2026-06-23: form controls drop the radius (moysklad inputs are square).
      expect(trigger.className).not.toContain('rounded-[var(--ms-radius-default)]');
      expect(trigger.className).toContain('border');
    });

    it('merges user className', () => {
      renderWithProviders(
        <Select value="usd" onChange={vi.fn()} options={OPTS} ariaLabel="x" className="my-cls" />,
      );
      const trigger = screen.getByRole('combobox', { name: 'x' });
      expect(trigger.className).toContain('my-cls');
      expect(trigger.className).toContain('h-[var(--ms-control-h)]');
    });
  });
});
