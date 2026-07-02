import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { SegmentedControl } from '@moysklad/ui';
/**
 * SegmentedControl (from @moysklad/ui) tests — the segmented single-select
 * toggle row built on hidden `<input type="radio">`s.
 *
 * Consolidates the hand-rolled "sr-only radio + styled box-label" idiom that
 * had been copy-pasted (with drift) across counterparty-adjustments
 * (direction increase/decrease) and settings/label-templates (page size +
 * barcode format). Tests guard the controlled value/onChange contract,
 * options rendering, whole-control + per-option disable, the auto-generated
 * group name, className merge, the forwarded data-test-id, and the canonical
 * `--ms-radius-default` segment radius (the drift label-templates had as
 * `radius-sm`).
 */
import { describe, expect, it, vi } from 'vitest';

const OPTS = [
  { value: 'A4' as const, label: 'A4' },
  { value: 'A5' as const, label: 'A5' },
  { value: 'A6' as const, label: 'A6' },
];

describe('SegmentedControl', () => {
  describe('basic rendering', () => {
    it('renders the wrapper as role="radiogroup"', () => {
      renderWithProviders(
        <SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} ariaLabel="Size" />,
      );
      expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeInTheDocument();
    });

    it('renders one radio input per option', () => {
      renderWithProviders(<SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} />);
      expect(screen.getAllByRole('radio')).toHaveLength(3);
    });

    it('renders each option label', () => {
      renderWithProviders(<SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} />);
      expect(screen.getByText('A4')).toBeInTheDocument();
      expect(screen.getByText('A5')).toBeInTheDocument();
      expect(screen.getByText('A6')).toBeInTheDocument();
    });
  });

  describe('controlled checked state', () => {
    it('the radio matching value is checked', () => {
      renderWithProviders(<SegmentedControl value="A5" onChange={vi.fn()} options={OPTS} />);
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios[0]?.checked).toBe(false); // A4
      expect(radios[1]?.checked).toBe(true); // A5
      expect(radios[2]?.checked).toBe(false); // A6
    });

    it('value=undefined → none checked', () => {
      renderWithProviders(<SegmentedControl value={undefined} onChange={vi.fn()} options={OPTS} />);
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios.every((r) => !r.checked)).toBe(true);
    });
  });

  describe('change behavior', () => {
    it('clicking a segment calls onChange with that value', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<SegmentedControl value="A4" onChange={onChange} options={OPTS} />);
      await user.click(screen.getByText('A5'));
      expect(onChange).toHaveBeenCalledWith('A5');
    });
  });

  describe('disabled', () => {
    it('whole-control disabled → every radio disabled', () => {
      renderWithProviders(
        <SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} disabled />,
      );
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios.every((r) => r.disabled)).toBe(true);
    });

    it('whole-control disabled → clicking does NOT fire onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <SegmentedControl value="A4" onChange={onChange} options={OPTS} disabled />,
      );
      await user.click(screen.getByText('A5'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('per-option disabled → only that radio is disabled', () => {
      renderWithProviders(
        <SegmentedControl
          value="A4"
          onChange={vi.fn()}
          options={[
            { value: 'A4', label: 'A4' },
            { value: 'A5', label: 'A5', disabled: true },
          ]}
        />,
      );
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios[0]?.disabled).toBe(false);
      expect(radios[1]?.disabled).toBe(true);
    });
  });

  describe('group name', () => {
    it('all radios share the same auto-generated name', () => {
      renderWithProviders(<SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} />);
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      const name = radios[0]?.name;
      expect(name).toBeTruthy();
      expect(radios.every((r) => r.name === name)).toBe(true);
    });

    it('honors a custom name prop', () => {
      renderWithProviders(
        <SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} name="pageSize" />,
      );
      const radios = screen.getAllByRole('radio') as HTMLInputElement[];
      expect(radios.every((r) => r.name === 'pageSize')).toBe(true);
    });
  });

  describe('class + attrs', () => {
    it('merges user className onto the wrapper (keeps the flex row)', () => {
      renderWithProviders(
        <SegmentedControl
          value="A4"
          onChange={vi.fn()}
          options={OPTS}
          ariaLabel="m"
          className="my-extra-cls"
        />,
      );
      const group = screen.getByRole('radiogroup');
      expect(group.className).toContain('my-extra-cls');
      expect(group.className).toContain('flex');
    });

    it('forwards data-test-id onto the hidden radio input', () => {
      renderWithProviders(
        <SegmentedControl
          value="INCREASE"
          onChange={vi.fn()}
          options={[
            { value: 'INCREASE', label: '+', 'data-test-id': 'direction-increase' },
            { value: 'DECREASE', label: '-', 'data-test-id': 'direction-decrease' },
          ]}
        />,
      );
      expect(screen.getByTestId('direction-increase')).toBeInTheDocument();
      expect(screen.getByTestId('direction-decrease')).toBeInTheDocument();
    });

    it('segments use the canonical control radius (not the radius-sm drift)', () => {
      renderWithProviders(<SegmentedControl value="A4" onChange={vi.fn()} options={OPTS} />);
      const segment = screen.getByText('A4').closest('label');
      expect(segment?.className).toContain('rounded-[var(--ms-radius-default)]');
      expect(segment?.className).not.toContain('--ms-radius-sm');
    });
  });
});
