import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { RadioGroup } from '@moysklad/ui';
/**
 * RadioGroup (from @moysklad/ui) tests — accessible radio-group built
 * on plain <input type="radio"> for native form/keyboard behavior.
 *
 * Used by: payment method selection, currency picker, attribute single-
 * choice fields, status filters.
 *
 * Tests guard the controlled value/onChange contract, options rendering,
 * vertical/horizontal layout, disabled options (whole + per-option),
 * description slot, and the auto-generated unique radio-group name.
 */
import { describe, expect, it, vi } from 'vitest';

const OPTS = [
  { value: 'cash' as const, label: 'Naqd' },
  { value: 'card' as const, label: 'Karta' },
  { value: 'transfer' as const, label: "O'tkazma" },
];

describe('RadioGroup', () => {
  describe('basic rendering', () => {
    it('renders the wrapper as role="radiogroup"', () => {
      renderWithProviders(
        <RadioGroup value="cash" onChange={vi.fn()} options={OPTS} ariaLabel="Method" />,
      );
      expect(screen.getByRole('radiogroup', { name: 'Method' })).toBeInTheDocument();
    });

    it('renders one radio input per option', () => {
      renderWithProviders(<RadioGroup value="cash" onChange={vi.fn()} options={OPTS} />);
      expect(screen.getAllByRole('radio')).toHaveLength(3);
    });

    it('renders each option label', () => {
      renderWithProviders(<RadioGroup value="cash" onChange={vi.fn()} options={OPTS} />);
      expect(screen.getByText('Naqd')).toBeInTheDocument();
      expect(screen.getByText('Karta')).toBeInTheDocument();
      expect(screen.getByText("O'tkazma")).toBeInTheDocument();
    });
  });

  describe('controlled checked state', () => {
    it('the radio matching value is checked', () => {
      renderWithProviders(<RadioGroup value="card" onChange={vi.fn()} options={OPTS} />);
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios[0]?.checked).toBe(false); // cash
      expect(radios[1]?.checked).toBe(true); // card
      expect(radios[2]?.checked).toBe(false); // transfer
    });

    it('value=undefined → none checked', () => {
      renderWithProviders(<RadioGroup value={undefined} onChange={vi.fn()} options={OPTS} />);
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios.every((r) => !r.checked)).toBe(true);
    });
  });

  describe('change behavior', () => {
    it('clicking a radio calls onChange with that value', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<RadioGroup value="cash" onChange={onChange} options={OPTS} />);
      await user.click(screen.getAllByRole('radio')[1]!);
      expect(onChange).toHaveBeenCalledWith('card');
    });

    it('clicking the label triggers onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<RadioGroup value="cash" onChange={onChange} options={OPTS} />);
      await user.click(screen.getByText("O'tkazma"));
      expect(onChange).toHaveBeenCalledWith('transfer');
    });
  });

  describe('orientation', () => {
    it('vertical (default) → flex-col', () => {
      renderWithProviders(
        <RadioGroup value="cash" onChange={vi.fn()} options={OPTS} ariaLabel="m" />,
      );
      const group = screen.getByRole('radiogroup');
      expect(group.className).toContain('flex-col');
    });

    it('horizontal → flex-row', () => {
      renderWithProviders(
        <RadioGroup
          value="cash"
          onChange={vi.fn()}
          options={OPTS}
          ariaLabel="m"
          orientation="horizontal"
        />,
      );
      const group = screen.getByRole('radiogroup');
      expect(group.className).toContain('flex-row');
    });
  });

  describe('disabled options', () => {
    it('disabled option renders the radio input as disabled', () => {
      renderWithProviders(
        <RadioGroup
          value="cash"
          onChange={vi.fn()}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B', disabled: true },
          ]}
        />,
      );
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios[0]?.disabled).toBe(false);
      expect(radios[1]?.disabled).toBe(true);
    });

    it('clicking a disabled radio does NOT fire onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <RadioGroup
          value="a"
          onChange={onChange}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B', disabled: true },
          ]}
        />,
      );
      await user.click(screen.getAllByRole('radio')[1]!);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('description slot', () => {
    it('renders option description when provided', () => {
      renderWithProviders(
        <RadioGroup
          value="x"
          onChange={vi.fn()}
          options={[{ value: 'x', label: 'Cash', description: 'Pay with physical money' }]}
        />,
      );
      expect(screen.getByText('Pay with physical money')).toBeInTheDocument();
    });

    it('does NOT render description when omitted', () => {
      renderWithProviders(
        <RadioGroup value="x" onChange={vi.fn()} options={[{ value: 'x', label: 'Cash' }]} />,
      );
      // No description text — only the label
      expect(screen.queryByText('Pay with physical money')).toBeNull();
    });
  });

  describe('group name', () => {
    it('all radios share the same name attribute (auto-generated)', () => {
      renderWithProviders(<RadioGroup value="cash" onChange={vi.fn()} options={OPTS} />);
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      const name = radios[0]?.name;
      expect(name).toBeTruthy();
      expect(radios.every((r) => r.name === name)).toBe(true);
    });

    it('honors custom name prop', () => {
      renderWithProviders(
        <RadioGroup value="cash" onChange={vi.fn()} options={OPTS} name="payment" />,
      );
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios.every((r) => r.name === 'payment')).toBe(true);
    });
  });

  describe('className merge', () => {
    it('merges user className onto the wrapper', () => {
      renderWithProviders(
        <RadioGroup
          value="cash"
          onChange={vi.fn()}
          options={OPTS}
          ariaLabel="m"
          className="my-extra-cls"
        />,
      );
      const group = screen.getByRole('radiogroup');
      expect(group.className).toContain('my-extra-cls');
      expect(group.className).toContain('flex-col');
    });
  });
});
