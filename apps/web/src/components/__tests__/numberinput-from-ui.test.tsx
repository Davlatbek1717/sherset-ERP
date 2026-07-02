import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { NumberInput } from '@moysklad/ui';
/**
 * NumberInput (from @moysklad/ui) tests — wrapped numeric input with
 * +/− stepper buttons. Used by every quantity/money/discount field
 * across the app (PositionEditor, attribute edit, payment forms).
 *
 * Why a wrapper instead of <input type="number">: native inputs scroll
 * on wheel, accept exponent notation, have inconsistent min/max
 * enforcement. This wrapper handles formatting + paste-safe parsing.
 *
 * Tests guard the value→display formatting, comma→dot decimal parsing,
 * stepper buttons (clamped to min/max), arrow-key keyboard nav,
 * suffix slot, disabled state.
 */
import { describe, expect, it, vi } from 'vitest';

describe('NumberInput', () => {
  describe('basic rendering', () => {
    it('renders an <input type="text"> with inputMode=decimal', () => {
      renderWithProviders(<NumberInput value={5} onChange={vi.fn()} ariaLabel="Qty" />);
      const input = screen.getByLabelText('Qty');
      expect(input.tagName).toBe('INPUT');
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('inputMode', 'decimal');
    });

    it('renders the +/− stepper buttons by default', () => {
      renderWithProviders(<NumberInput value={5} onChange={vi.fn()} ariaLabel="x" />);
      expect(screen.getByRole('button', { name: 'Decrease' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Increase' })).toBeInTheDocument();
    });

    it('does NOT render steppers when steppers=false', () => {
      renderWithProviders(
        <NumberInput value={5} onChange={vi.fn()} ariaLabel="x" steppers={false} />,
      );
      expect(screen.queryByRole('button', { name: 'Decrease' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Increase' })).toBeNull();
    });

    it('renders empty when value=null', () => {
      renderWithProviders(<NumberInput value={null} onChange={vi.fn()} ariaLabel="x" />);
      expect(screen.getByLabelText('x')).toHaveValue('');
    });
  });

  describe('value formatting', () => {
    it('formats value=5 precision=0 as "5"', () => {
      renderWithProviders(<NumberInput value={5} onChange={vi.fn()} ariaLabel="x" precision={0} />);
      expect(screen.getByLabelText('x')).toHaveValue('5');
    });

    it('formats value=12.345 precision=2 as "12.35"', () => {
      renderWithProviders(
        <NumberInput value={12.345} onChange={vi.fn()} ariaLabel="x" precision={2} />,
      );
      expect(screen.getByLabelText('x')).toHaveValue('12.35');
    });

    it('formats value=10 precision=2 as "10.00"', () => {
      renderWithProviders(
        <NumberInput value={10} onChange={vi.fn()} ariaLabel="x" precision={2} />,
      );
      expect(screen.getByLabelText('x')).toHaveValue('10.00');
    });
  });

  describe('parent-driven value resync', () => {
    it('updates display when parent value changes', () => {
      const { rerender } = renderWithProviders(
        <NumberInput value={5} onChange={vi.fn()} ariaLabel="x" />,
      );
      expect(screen.getByLabelText('x')).toHaveValue('5');
      rerender(<NumberInput value={42} onChange={vi.fn()} ariaLabel="x" />);
      expect(screen.getByLabelText('x')).toHaveValue('42');
    });
  });

  describe('stepper buttons', () => {
    it('Increase calls onChange with current+step', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" step={1} />);
      await user.click(screen.getByRole('button', { name: 'Increase' }));
      expect(onChange).toHaveBeenCalledWith(6);
    });

    it('Decrease calls onChange with current-step', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" step={1} />);
      await user.click(screen.getByRole('button', { name: 'Decrease' }));
      expect(onChange).toHaveBeenCalledWith(4);
    });

    it('honors custom step (e.g., 5)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" step={5} />);
      await user.click(screen.getByRole('button', { name: 'Increase' }));
      expect(onChange).toHaveBeenCalledWith(10);
    });

    it('starts from 0 when value is null', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={null} onChange={onChange} ariaLabel="x" step={1} />);
      await user.click(screen.getByRole('button', { name: 'Increase' }));
      expect(onChange).toHaveBeenCalledWith(1);
    });
  });

  describe('min/max clamping', () => {
    it('Increase fires onChange with the clamped value when above max', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <NumberInput value={9} onChange={onChange} ariaLabel="x" max={10} step={1} />,
      );
      await user.click(screen.getByRole('button', { name: 'Increase' }));
      // current(9) + step(1) = 10 — exactly at max, allowed
      expect(onChange).toHaveBeenCalledWith(10);
    });

    it('Increase button is disabled when value is already at max', () => {
      renderWithProviders(<NumberInput value={10} onChange={vi.fn()} ariaLabel="x" max={10} />);
      // value === max → button disabled
      expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    });

    it('Decrease fires onChange with the clamped value when below min', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <NumberInput value={1} onChange={onChange} ariaLabel="x" min={0} step={1} />,
      );
      await user.click(screen.getByRole('button', { name: 'Decrease' }));
      // current(1) - step(1) = 0 — exactly at min, allowed
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('Decrease button is disabled when value is already at min', () => {
      renderWithProviders(<NumberInput value={0} onChange={vi.fn()} ariaLabel="x" min={0} />);
      expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    });
  });

  describe('keyboard nav', () => {
    it('ArrowUp increments by step', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" step={1} />);
      const input = screen.getByLabelText('x');
      input.focus();
      await user.keyboard('{ArrowUp}');
      expect(onChange).toHaveBeenCalledWith(6);
    });

    it('ArrowDown decrements by step', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" step={1} />);
      const input = screen.getByLabelText('x');
      input.focus();
      await user.keyboard('{ArrowDown}');
      expect(onChange).toHaveBeenCalledWith(4);
    });
  });

  describe('comma → dot decimal parsing on blur', () => {
    it('blur with "12,5" commits 12.5 (Russian-style decimal)', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <NumberInput value={0} onChange={onChange} ariaLabel="x" precision={2} />,
      );
      const input = screen.getByLabelText('x');
      await user.clear(input);
      await user.type(input, '12,5');
      await user.tab(); // triggers blur
      expect(onChange).toHaveBeenCalledWith(12.5);
    });

    it('blur with empty string commits null', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" />);
      const input = screen.getByLabelText('x');
      await user.clear(input);
      await user.tab();
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('blur ignores non-numeric input', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NumberInput value={5} onChange={onChange} ariaLabel="x" />);
      const input = screen.getByLabelText('x');
      await user.clear(input);
      await user.type(input, 'abc');
      await user.tab();
      // onChange may have been called by clear (with null) but NOT with NaN
      const calls = onChange.mock.calls.map((c) => c[0]);
      expect(calls.some((v) => Number.isNaN(v))).toBe(false);
    });
  });

  describe('suffix slot', () => {
    it('renders the suffix when provided', () => {
      renderWithProviders(<NumberInput value={5} onChange={vi.fn()} ariaLabel="x" suffix="сум" />);
      expect(screen.getByText('сум')).toBeInTheDocument();
    });

    it('does NOT render suffix span when omitted', () => {
      const { container } = renderWithProviders(
        <NumberInput value={5} onChange={vi.fn()} ariaLabel="x" />,
      );
      expect(container.querySelector('span.pr-2')).toBeNull();
    });
  });

  describe('disabled state', () => {
    it('disables input + both stepper buttons', () => {
      renderWithProviders(<NumberInput value={5} onChange={vi.fn()} ariaLabel="x" disabled />);
      expect(screen.getByLabelText('x')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    });
  });

  describe('invalid state', () => {
    it('sets aria-invalid="true" when invalid=true', () => {
      renderWithProviders(<NumberInput value={5} onChange={vi.fn()} ariaLabel="x" invalid />);
      expect(screen.getByLabelText('x')).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
